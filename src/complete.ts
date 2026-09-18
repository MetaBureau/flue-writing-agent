import { AsyncLocalStorage } from "node:async_hooks";
import { type ReasoningEffort, reasoningEffortField } from "./catalog.ts";

export interface CompletionTarget {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
  cachedPrefix?: string;
}

export interface TokenUsage {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface ChatResult {
  content: string;
  finishReason: string | undefined;
  usage: TokenUsage;
}

export interface CompleteOptions {
  temperature: number;
  label: string;
  maxTokens?: number;
  reasoningEffort?: string;
  supportedParams?: readonly string[];
  responseFormat?: Record<string, unknown>;
  meter?: RunMeter;
  signal?: AbortSignal;
}

export const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
};

const runSignal = new AsyncLocalStorage<AbortSignal>();

export function withRunSignal<T>(
  signal: AbortSignal | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!signal) return Promise.resolve(fn());
  return Promise.resolve(runSignal.run(signal, fn));
}

export function combineSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const live = signals.filter((item): item is AbortSignal => Boolean(item));
  if (live.length === 0) return new AbortController().signal;
  if (live.length === 1) return live[0]!;
  return AbortSignal.any(live);
}

export function runFetchSignal(
  timeoutMs: number,
  extra?: AbortSignal,
): AbortSignal {
  return combineSignals(
    AbortSignal.timeout(timeoutMs),
    extra,
    runSignal.getStore(),
  );
}

export class CutOffReply extends Error {
  readonly usage: TokenUsage;
  readonly modelId: string;
  readonly content: string;

  constructor(
    label: string,
    modelId: string,
    usage: TokenUsage,
    content = "",
  ) {
    super(`${label} was cut off (finish_reason: length)`);
    this.name = "CutOffReply";
    this.usage = usage;
    this.modelId = modelId;
    this.content = content;
  }
}

export class RunMeter {
  readonly byModel = new Map<string, TokenUsage>();

  static from(snapshot?: Readonly<Record<string, TokenUsage>>): RunMeter {
    const meter = new RunMeter();
    if (!snapshot) return meter;
    for (const [modelId, usage] of Object.entries(snapshot)) {
      meter.byModel.set(modelId, { ...EMPTY_USAGE, ...usage });
    }
    return meter;
  }

  snapshot(): Record<string, TokenUsage> {
    return Object.fromEntries(this.byModel);
  }

  add(modelId: string, usage: TokenUsage): void {
    const current = this.byModel.get(modelId) ?? { ...EMPTY_USAGE };
    this.byModel.set(modelId, {
      promptTokens: current.promptTokens + usage.promptTokens,
      cachedTokens: current.cachedTokens + usage.cachedTokens,
      completionTokens: current.completionTokens + usage.completionTokens,
      reasoningTokens: current.reasoningTokens + usage.reasoningTokens,
    });
  }

  totals(): TokenUsage {
    let total = { ...EMPTY_USAGE };
    for (const usage of this.byModel.values()) {
      total = {
        promptTokens: total.promptTokens + usage.promptTokens,
        cachedTokens: total.cachedTokens + usage.cachedTokens,
        completionTokens: total.completionTokens + usage.completionTokens,
        reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
      };
    }
    return total;
  }
}

export function estimateUsd(
  meter: RunMeter,
  prices: ReadonlyMap<
    string,
    { inputPerToken: number; outputPerToken: number }
  >,
): { usd: number; complete: boolean } {
  let usd = 0;
  let complete = meter.byModel.size > 0;
  for (const [modelId, usage] of meter.byModel) {
    const price = prices.get(modelId);
    if (!price) {
      complete = false;
      continue;
    }
    usd += usage.promptTokens * price.inputPerToken +
      usage.completionTokens * price.outputPerToken;
  }
  return { usd, complete };
}

export function formatEstimate(
  estimate: { usd: number; complete: boolean } | undefined,
): string {
  if (!estimate || (!estimate.complete && estimate.usd === 0)) {
    return "estimate unavailable";
  }
  const dollars = `estimate $${estimate.usd.toFixed(3)}`;
  return estimate.complete ? dollars : `${dollars} incomplete`;
}

export function formatRun(
  meter: RunMeter,
  prices: ReadonlyMap<
    string,
    { inputPerToken: number; outputPerToken: number }
  >,
): string {
  const totals = meter.totals();
  const estimate = formatEstimate(
    meter.byModel.size === 0 ? undefined : estimateUsd(meter, prices),
  );
  return `${estimate} · in ${totals.promptTokens} cached ${totals.cachedTokens} out ${totals.completionTokens} reasoning ${totals.reasoningTokens}`;
}

export function responseFormatField(
  supportedParams: readonly string[] | undefined,
  format: Record<string, unknown> | undefined,
): { response_format: Record<string, unknown> } | Record<string, never> {
  if (!format || !supportedParams?.includes("response_format")) return {};
  return { response_format: format };
}

export function cacheSystemMessages(
  modelId: string,
  messages: ChatMessage[],
): Array<{ role: "system" | "user"; content: unknown }> {
  return messages.map((message) => {
    const rest = message.content.startsWith(message.cachedPrefix ?? "\0")
      ? message.content.slice(message.cachedPrefix?.length ?? 0).replace(/^\n+/, "")
      : message.content;
    if (
      !modelId.startsWith("anthropic/") || message.role !== "system" ||
      !message.cachedPrefix
    ) {
      return { role: message.role, content: message.content };
    }
    const blocks: Array<Record<string, unknown>> = [{
      type: "text",
      text: message.cachedPrefix,
      cache_control: { type: "ephemeral" },
    }];
    if (rest) blocks.push({ type: "text", text: rest });
    return { role: "system", content: blocks };
  });
}

export function completionRequestBody(
  modelId: string,
  messages: ChatMessage[],
  options: CompleteOptions,
): Record<string, unknown> {
  return {
    model: modelId,
    temperature: options.temperature,
    stream: true,
    stream_options: { include_usage: true },
    messages: cacheSystemMessages(modelId, messages),
    ...(options.maxTokens === undefined
      ? {}
      : { max_completion_tokens: options.maxTokens }),
    ...reasoningEffortField(options.supportedParams, options.reasoningEffort),
    ...responseFormatField(options.supportedParams, options.responseFormat),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFromChoice(choice: unknown): string {
  if (!isRecord(choice)) return "";
  const delta = choice.delta;
  const message = choice.message;
  if (isRecord(delta) && typeof delta.content === "string") {
    return delta.content;
  }
  if (isRecord(message) && typeof message.content === "string") {
    return message.content;
  }
  return "";
}

function contentFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const choices = payload.choices;
  if (!Array.isArray(choices)) return "";
  return choices.map(textFromChoice).join("");
}

function finishReason(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return undefined;
  const choice = payload.choices.at(-1);
  if (!isRecord(choice) || typeof choice.finish_reason !== "string") {
    return undefined;
  }
  return choice.finish_reason;
}

function usageNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function usageFromPayload(payload: unknown): TokenUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;
  const usage = payload.usage;
  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : undefined;
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : undefined;
  return {
    promptTokens: usageNumber(usage, "prompt_tokens"),
    cachedTokens: promptDetails
      ? usageNumber(promptDetails, "cached_tokens")
      : 0,
    completionTokens: usageNumber(usage, "completion_tokens"),
    reasoningTokens: completionDetails
      ? usageNumber(completionDetails, "reasoning_tokens")
      : 0,
  };
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 180);
}

function recordUsage(
  meter: RunMeter | undefined,
  modelId: string,
  usage: TokenUsage,
  label: string,
  elapsedMs: number,
  reason: string,
): void {
  meter?.add(modelId, usage);
  const finish = reason ? ` finish=${reason}` : "";
  console.log(
    `[${label}] ${modelId} ${elapsedMs}ms${finish} in=${usage.promptTokens} cached=${usage.cachedTokens} out=${usage.completionTokens} reasoning=${usage.reasoningTokens}`,
  );
}

export async function streamChat(
  model: CompletionTarget,
  messages: ChatMessage[],
  options: CompleteOptions,
): Promise<ChatResult> {
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
    body: JSON.stringify(
      completionRequestBody(model.modelId, messages, options),
    ),
    signal: runFetchSignal(150_000, options.signal),
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
      `${options.label} failed: HTTP ${response.status}.${limitNote}${gatewayNote} ${
        snippet(body)
      }`,
    );
  }

  let content = "";
  let reason = "";
  let usage = { ...EMPTY_USAGE };

  const take = (payload: unknown) => {
    content += contentFromPayload(payload);
    const nextReason = finishReason(payload);
    if (nextReason) reason = nextReason;
    const nextUsage = usageFromPayload(payload);
    if (nextUsage) usage = nextUsage;
  };

  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    take(await response.json());
  } else {
    if (!response.body) {
      throw new Error(`${options.label} returned an empty body`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
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
          take(JSON.parse(data));
        } catch {
          continue;
        }
      }
    }
  }

  recordUsage(
    options.meter,
    model.modelId,
    usage,
    options.label,
    elapsed(),
    reason,
  );
  if (reason === "length") {
    throw new CutOffReply(options.label, model.modelId, usage, content);
  }
  return { content, finishReason: reason || undefined, usage };
}

export type { ReasoningEffort };
