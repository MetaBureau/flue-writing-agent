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

export const RUBRIC_IDS = [
  "claim",
  "advance",
  "objection",
  "fidelity",
  "voice",
  "audience",
  "takeaway",
  "silence",
] as const;

export type RubricId = (typeof RUBRIC_IDS)[number];

export interface RubricItem {
  id: RubricId;
  pass: boolean;
  passage: string;
  fix: string;
}

export interface CriticReview {
  issues: CriticIssue[];
  rubric: RubricItem[];
}

export const CRITIC_MAX_TOKENS = 2048;

export const RUBRIC_ITEMS: { id: RubricId; text: string }[] = [
  {
    id: "claim",
    text: "Claim. The opening states one arguable claim. A reader can quote it.",
  },
  {
    id: "advance",
    text: "Advance. Every section moves that claim forward. No section is a source summary.",
  },
  {
    id: "objection",
    text:
      "Objection. The strongest counter-evidence in the notes is stated at its full strength and answered, not noted and dropped.",
  },
  {
    id: "fidelity",
    text:
      "Fidelity. No source is used against its own argument. Stance and date are respected.",
  },
  {
    id: "voice",
    text:
      "Voice. The essay explains in its own words. Quotation is used where the wording itself is the evidence.",
  },
  {
    id: "audience",
    text:
      "Audience. Diction, assumed knowledge, and spelling match the brief's reader.",
  },
  {
    id: "takeaway",
    text:
      "Takeaway. The close answers the claim. It does not summarise the sections or retreat into \"the evidence does not resolve this\".",
  },
  {
    id: "silence",
    text:
      "Silence about process. No sentence discusses the notes, the sources as a set, the research, or the essay itself. Gaps belong in the sidecar.",
  },
];

export const CRITIC_SYSTEM =
  "You judge one essay against the rubric below. The brief is the rulebook. Do not invent a requirement the brief did not state. Do not judge word count as a miss. Return JSON {items: [{id, pass, passage, fix}]} with exactly the eight ids. On fail, passage is one sentence from the essay. Fix is one or two sentences. On pass, passage and fix are empty.";

export const CRITIC_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "critic_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "pass", "passage", "fix"],
            properties: {
              id: { type: "string" },
              pass: { type: "boolean" },
              passage: { type: "string" },
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
    }\nTurn each into a passage-level fix only if it still appears in the essay.`
    : "";
  const rubric = RUBRIC_ITEMS.map((item) => `${item.id}: ${item.text}`).join(
    "\n",
  );
  return [
    briefBlock(brief),
    extra,
    rubric,
    "Return JSON {items: [{id, pass, passage, fix}]} for those eight ids. Passage is one sentence. Fix is one or two sentences.",
    essay.trim(),
  ].filter(Boolean).join("\n\n");
}

function emptyRubric(): RubricItem[] {
  return RUBRIC_IDS.map((id) => ({ id, pass: true, passage: "", fix: "" }));
}

export function issuesFromRubric(rubric: readonly RubricItem[]): CriticIssue[] {
  return rubric.filter((item) => !item.pass).map((item) => ({
    passage: item.passage,
    problem: `${item.id}: ${
      RUBRIC_ITEMS.find((row) => row.id === item.id)?.text ?? item.id
    }`,
    fix: item.fix || "Fix the quoted passage so this rubric item passes.",
  }));
}

export function criticFromContent(content: string): CriticReview {
  const row = jsonObject(content);
  const byId = new Map<string, RubricItem>();
  if (Array.isArray(row?.items)) {
    for (const item of row.items) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id.trim() : "";
      if (!RUBRIC_IDS.includes(id as RubricId)) continue;
      byId.set(id, {
        id: id as RubricId,
        pass: rec.pass === true,
        passage: typeof rec.passage === "string" ? rec.passage.trim() : "",
        fix: typeof rec.fix === "string" ? rec.fix.trim() : "",
      });
    }
  }
  const rubric = RUBRIC_IDS.map((id) =>
    byId.get(id) ?? { id, pass: false, passage: "", fix: "" }
  );
  return { issues: issuesFromRubric(rubric), rubric };
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

export function criticSidecar(
  review: CriticReview,
  extra: readonly string[] = [],
): string {
  const lines = ["Critic:"];
  for (const item of review.rubric) {
    if (item.pass) {
      lines.push(`- ${item.id}: pass`);
      continue;
    }
    lines.push(
      `- ${item.id}: fail${item.passage ? ` · ${item.passage}` : ""}`,
    );
  }
  if (extra.length > 0) {
    lines.push("", "Harness:");
    for (const item of extra) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

export function rubricFromSidecar(text: string): RubricItem[] {
  const byId = new Map<string, RubricItem>();
  for (const line of text.split("\n")) {
    const match = line.match(/^- (\w+): (pass|fail)(?: · (.+))?$/);
    if (!match) continue;
    const id = match[1];
    if (!RUBRIC_IDS.includes(id as RubricId)) continue;
    byId.set(id, {
      id: id as RubricId,
      pass: match[2] === "pass",
      passage: match[3]?.trim() ?? "",
      fix: "",
    });
  }
  return RUBRIC_IDS.map((id) =>
    byId.get(id) ?? { id, pass: true, passage: "", fix: "" }
  );
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
  if (!input.model.apiKey) {
    return { issues: [], rubric: emptyRubric() };
  }
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
    if (error instanceof CutOffReply) {
      return { issues: [], rubric: emptyRubric() };
    }
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
