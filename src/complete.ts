export interface CompletionTarget {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface CompleteOptions {
  temperature: number;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFromChoice(choice: unknown): string {
  if (!isRecord(choice)) return "";
  const delta = choice.delta;
  const message = choice.message;
  if (isRecord(delta) && typeof delta.content === "string") return delta.content;
  if (isRecord(message) && typeof message.content === "string") return message.content;
  return "";
}

function contentFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";
  return choices.map(textFromChoice).join("");
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 180);
}

export async function streamChat(
  model: CompletionTarget,
  messages: ChatMessage[],
  options: CompleteOptions,
): Promise<string> {
  if (!model.apiKey) {
    throw new Error(`${model.name} API key is not set`);
  }
  if (!model.baseUrl) {
    throw new Error(`${model.name} base URL is not set`);
  }
  if (!model.modelId) {
    throw new Error(`${model.name} model id is not set`);
  }

  const started = performance.now();
  const response = await fetch(`${model.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${model.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: model.modelId,
      temperature: options.temperature,
      stream: true,
      messages,
    }),
    signal: AbortSignal.timeout(150_000),
  });

  const elapsed = () => Math.round(performance.now() - started);

  if (!response.ok) {
    const body = await response.text();
    const rate = response.headers.get("retry-after");
    const limitNote = response.status === 429
      ? ` Rate limit${rate ? `, retry after ${rate}s` : ""}.`
      : "";
    const gatewayNote = response.status === 524
      ? " Cloudflare origin timeout. Streaming should have prevented this; the upstream sent no bytes in time."
      : "";
    throw new Error(
      `${options.label} failed: HTTP ${response.status}.${limitNote}${gatewayNote} ${snippet(body)}`,
    );
  }

  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const payload: unknown = await response.json();
    const content = contentFromPayload(payload);
    console.log(`[${options.label}] ${model.modelId} ${elapsed()}ms`);
    return content;
  }

  if (!response.body) {
    throw new Error(`${options.label} returned an empty body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        content += contentFromPayload(JSON.parse(data));
      } catch {
        continue;
      }
    }
  }

  console.log(`[${options.label}] ${model.modelId} ${elapsed()}ms`);
  return content;
}
