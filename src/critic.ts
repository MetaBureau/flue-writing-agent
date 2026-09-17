import type { Brief } from "./brief.ts";
import {
  briefBlock,
  BRIEF_ASK,
  jsonObject,
  NOTES_GROUNDING,
  systemMessage,
} from "./agents/write.ts";
import { CutOffReply, type RunMeter, streamChat } from "./complete.ts";
import { formatAttributedNotes, type SourceNote } from "./notes.ts";
import type { ResolvedProvider } from "./providers.ts";

export interface CriticIssue {
  passage: string;
  problem: string;
  fix: string;
}

export interface CriticReview {
  issues: CriticIssue[];
}

export const CRITIC_MAX_TOKENS = 8192;

export const CRITIC_SYSTEM =
  "You are one critic. You see the brief, the attributed notes, and the cited draft. The brief is the rulebook. Return problems tied to specific passages. Do not invent a requirement the brief did not state. Do not judge word count as a miss.";

export const CRITIC_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "critic_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["issues"],
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["passage", "problem", "fix"],
            properties: {
              passage: { type: "string" },
              problem: { type: "string" },
              fix: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export function criticUserPrompt(
  brief: Brief,
  essay: string,
  harness: readonly string[] = [],
): string {
  const extra = harness.length > 0
    ? `The harness already found:\n${
      harness.map((item) => `- ${item}`).join("\n")
    }\nTurn each into a passage-level fix.`
    : "";
  return [
    briefBlock(brief),
    extra,
    "Check that every cited claim matches its note, including the source's stance and date.",
    "Check that the essay does what the brief asks. Handle counter-evidence the notes contain. Match the audience's spelling.",
    "Check that quoted words stay under 15% of the body; paraphrase the rest and still cite.",
    "A copied phrase that is not in quotation marks is a problem. An essay that names the outlet in every sentence is a problem. Return JSON {issues: [{passage, problem, fix}]}. Empty issues means pass.",
    essay.trim(),
  ].filter(Boolean).join("\n\n");
}

export function criticFromContent(content: string): CriticReview {
  const row = jsonObject(content);
  const issues: CriticIssue[] = [];
  if (Array.isArray(row?.issues)) {
    for (const item of row.issues) {
      if (typeof item !== "object" || item === null) continue;
      const issue = item as Record<string, unknown>;
      const problem = typeof issue.problem === "string" ? issue.problem.trim() : "";
      if (!problem) continue;
      issues.push({
        passage: typeof issue.passage === "string" ? issue.passage.trim() : "",
        problem,
        fix: typeof issue.fix === "string" ? issue.fix.trim() : "",
      });
    }
  }
  return { issues };
}

export function issuesFromHarness(problems: readonly string[]): CriticIssue[] {
  return problems.map((problem) => {
    const copied = problem.match(/^copied without quotes from [^:]+: (.+)$/)
      ?.[1];
    const figure = problem.match(/^figure (.+) has no citation$/)?.[1];
    const quote = problem.match(/^quote has no citation: (.+)$/)?.[1];
    const overQuoted = problem.startsWith("quoted words are");
    const passage = copied ?? figure ?? quote ?? "";
    return {
      passage,
      problem,
      fix: overQuoted
        ? "Paraphrase. Keep only the sharpest short quotes. Stay under 15% quoted words. Cite the notes."
        : copied
        ? `Rewrite this in your own words, or quote a short phrase if it would lose force: ${copied}`
        : "Cite the matching note or drop the figure.",
    };
  });
}

export function mergeIssues(
  review: readonly CriticIssue[],
  harness: readonly CriticIssue[],
): CriticIssue[] {
  const seen = new Set(review.map((issue) => issue.problem));
  return [...review, ...harness.filter((issue) => !seen.has(issue.problem))];
}

export function criticSidecar(review: CriticReview, extra: readonly string[] = []): string {
  const lines = ["Critic:"];
  if (review.issues.length === 0 && extra.length === 0) {
    lines.push("pass");
    return lines.join("\n");
  }
  for (const issue of review.issues) {
    lines.push(`- ${issue.problem}${issue.passage ? ` · ${issue.passage}` : ""}`);
  }
  for (const item of extra) lines.push(`- ${item}`);
  return lines.join("\n");
}

export function reviseUserPrompt(
  brief: Brief,
  essay: string,
  issues: readonly CriticIssue[],
): string {
  const listed = issues.map((issue) =>
    `- Passage: ${issue.passage || "(locate from the problem)"}\n  Problem: ${issue.problem}\n  Fix: ${issue.fix}`
  ).join("\n");
  return [
    briefBlock(brief),
    BRIEF_ASK,
    "Fix only these passages. Leave the rest of the essay unchanged. Keep citations. Return the full essay.",
    listed,
    essay.trim(),
  ].join("\n\n");
}

export async function reviewEssay(input: {
  brief: Brief;
  notes: readonly SourceNote[];
  essay: string;
  model: ResolvedProvider;
  meter?: RunMeter;
  supportedParams?: readonly string[];
  harness?: readonly string[];
}): Promise<CriticReview> {
  if (!input.model.apiKey) return { issues: [] };
  try {
    const content = (await streamChat(input.model, [
      systemMessage(
        formatAttributedNotes(input.notes),
        CRITIC_SYSTEM,
        input.brief,
      ),
      {
        role: "user",
        content: criticUserPrompt(input.brief, input.essay, input.harness),
      },
    ], {
      temperature: 0,
      label: "critic",
      maxTokens: CRITIC_MAX_TOKENS,
      meter: input.meter,
      supportedParams: input.supportedParams,
      responseFormat: CRITIC_RESPONSE_FORMAT,
    })).content;
    return criticFromContent(content);
  } catch (error) {
    if (error instanceof CutOffReply) return { issues: [] };
    throw error;
  }
}

export async function revisePassages(input: {
  brief: Brief;
  notes: readonly SourceNote[];
  essay: string;
  issues: readonly CriticIssue[];
  model: ResolvedProvider;
  meter?: RunMeter;
  supportedParams?: readonly string[];
}): Promise<string> {
  if (!input.model.apiKey || input.issues.length === 0) return input.essay;
  try {
    const content = (await streamChat(input.model, [
      systemMessage(
        formatAttributedNotes(input.notes),
        `${NOTES_GROUNDING} Fix only the named passages. Return the full essay.`,
        input.brief,
      ),
      {
        role: "user",
        content: reviseUserPrompt(input.brief, input.essay, input.issues),
      },
    ], {
      temperature: 0.2,
      label: "revise",
      maxTokens: 8192,
      meter: input.meter,
      supportedParams: input.supportedParams,
    })).content;
    return content.trim() || input.essay;
  } catch (error) {
    if (error instanceof CutOffReply) return input.essay;
    throw error;
  }
}
