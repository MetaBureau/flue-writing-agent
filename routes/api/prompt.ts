import { define } from "../../define.ts";
import { nextPromptTurn, PROMPT_MAX_TURNS, type PromptAnswer } from "../../src/prompt.ts";
import {
  isProviderModel,
  PROVIDERS,
  providerKeyProblem,
  reloadEnv,
  resolveProvider,
} from "../../src/providers.ts";

function answersFrom(value: unknown): PromptAnswer[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length > PROMPT_MAX_TURNS) return undefined;
  const turns: PromptAnswer[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return undefined;
    if (!("question" in item) || !("answer" in item)) return undefined;
    if (typeof item.question !== "string" || typeof item.answer !== "string") {
      return undefined;
    }
    const question = item.question.trim();
    const answer = item.answer.trim();
    if (!question || !answer || question.length > 500 || answer.length > 2000) {
      return undefined;
    }
    turns.push({ question, answer });
  }
  return turns;
}

export const handler = define.handlers({
  async POST(ctx) {
    await reloadEnv();
    const body = await ctx.req.json().catch(() => null) as {
      provider?: string;
      model?: string;
      seed?: string;
      turns?: unknown;
      force?: boolean;
    } | null;
    const provider = body?.provider || "mercury";
    const model = body?.model || undefined;
    const seed = body?.seed?.trim() ?? "";
    const turns = answersFrom(body?.turns ?? []);
    if (!(provider in PROVIDERS)) {
      return Response.json({ error: "Unknown provider." }, { status: 400 });
    }
    if (model && !isProviderModel(provider, model)) {
      return Response.json({ error: "Unknown model for that provider." }, { status: 400 });
    }
    if (!seed || seed.length > 500) {
      return Response.json({ error: "A subject is required." }, { status: 400 });
    }
    if (!turns) {
      return Response.json({ error: "The answers are not valid." }, { status: 400 });
    }
    const keyProblem = providerKeyProblem(provider);
    if (keyProblem) {
      return Response.json({ error: keyProblem }, { status: 400 });
    }
    try {
      const turn = await nextPromptTurn({
        model: resolveProvider(provider, "fast", model),
        seed,
        turns,
        force: body?.force === true,
      });
      return Response.json(turn);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The prompt interview failed.";
      return Response.json({ error: message }, { status: 500 });
    }
  },
});