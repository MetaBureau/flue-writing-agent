import { type CompletionTarget, streamChat } from "./complete.ts";
import { describesSourcePage } from "./agents/write.ts";

export const PROMPT_MAX_TURNS = 5;
export const PROMPT_MAX_TOKENS = 1024;

export const PROMPT_SYSTEM = [
  "You interview the user so you can write one essay prompt.",
  "Ask one question at a time. Ask only what the answers do not already say.",
  "Ask about the reader, the purpose, the claim, or a fact the user already knows.",
  "Do not ask about length. Do not invent a fact, a name, or an event.",
  "When you have a reader, a purpose, and a subject, or when asked to finish, write the prompt.",
  "Return only JSON: {\"status\":\"ask\",\"question\":\"...\"} or {\"status\":\"ready\",\"prompt\":\"...\"}.",
  "The prompt starts with one sentence that names the subject. Then state the reader, the purpose, the claim, and only facts the user gave.",
  "Do not tell the writer how to write. Do not mention word counts or source pages.",
].join(" ");

export const FALLBACK_QUESTIONS = [
  "Who should read this, and why them?",
  "What should they understand by the end?",
  "What one claim should the essay make, if you have one?",
  "What do you already know that must appear?",
  "What must the essay leave out?",
] as const;

export type PromptAnswer = { question: string; answer: string };

export type PromptTurn =
  | { status: "ask"; question: string }
  | { status: "ready"; prompt: string };

export function promptUserMessage(input: {
  seed: string;
  turns: PromptAnswer[];
  force: boolean;
}): string {
  const lines = [
    `Subject: ${input.seed.trim()}`,
    `Answers so far: ${input.turns.length}. Stop asking after ${PROMPT_MAX_TURNS}.`,
  ];
  for (const turn of input.turns) {
    lines.push(`Question: ${turn.question}`, `Answer: ${turn.answer}`);
  }
  if (input.force || input.turns.length >= PROMPT_MAX_TURNS) {
    lines.push("Finish now. Return status ready and the prompt. Do not ask another question.");
  } else if (input.turns.length === 0) {
    lines.push("Ask the first question. Do not write the prompt yet.");
  } else {
    lines.push(
      "Ask the next missing question, or return the prompt if you have a reader, a purpose, and a subject.",
    );
  }
  return lines.join("\n\n");
}

export function essayPrompt(seed: string, turns: PromptAnswer[]): string {
  const subject = seed.trim().replace(/[.]+$/, "");
  const parts = [`${subject}.`];
  for (const turn of turns) {
    const answer = turn.answer.trim();
    if (!answer) continue;
    parts.push(`${turn.question.trim()} ${answer}`);
  }
  return `${parts.join("\n\n")}\n`;
}

export function fallbackQuestion(turns: PromptAnswer[]): string | undefined {
  const asked = new Set(turns.map((turn) => turn.question));
  return FALLBACK_QUESTIONS.find((question) => !asked.has(question));
}

export function parsePromptTurn(content: string): PromptTurn | undefined {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const status = "status" in value ? value.status : undefined;
  if (
    status === "ask" &&
    "question" in value &&
    typeof value.question === "string" &&
    value.question.trim()
  ) {
    return { status: "ask", question: value.question.trim() };
  }
  if (
    status === "ready" &&
    "prompt" in value &&
    typeof value.prompt === "string" &&
    value.prompt.trim() &&
    !describesSourcePage(value.prompt)
  ) {
    return { status: "ready", prompt: value.prompt.trim() };
  }
  return undefined;
}

export function acceptPromptTurn(
  seed: string,
  turns: PromptAnswer[],
  content: string,
  force: boolean,
): PromptTurn {
  const parsed = parsePromptTurn(content);
  if (force || turns.length >= PROMPT_MAX_TURNS) {
    if (parsed?.status === "ready") return parsed;
    return { status: "ready", prompt: essayPrompt(seed, turns) };
  }
  if (parsed?.status === "ask" || parsed?.status === "ready") return parsed;
  const question = fallbackQuestion(turns);
  if (question) return { status: "ask", question };
  return { status: "ready", prompt: essayPrompt(seed, turns) };
}

export async function nextPromptTurn(input: {
  model: CompletionTarget;
  seed: string;
  turns: PromptAnswer[];
  force?: boolean;
}): Promise<PromptTurn> {
  const force = input.force === true || input.turns.length >= PROMPT_MAX_TURNS;
  const reply = await streamChat(input.model, [
    { role: "system", content: PROMPT_SYSTEM },
    {
      role: "user",
      content: promptUserMessage({
        seed: input.seed,
        turns: input.turns,
        force,
      }),
    },
  ], {
    temperature: 0.3,
    label: "prompt",
    maxTokens: PROMPT_MAX_TOKENS,
  });
  return acceptPromptTurn(input.seed, input.turns, reply.content, force);
}
