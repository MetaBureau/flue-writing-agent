import type { Brief } from "./brief.ts";
import {
  briefBlock,
  BRIEF_ASK,
  type EssayPlan,
  jsonObject,
  NOTES_GROUNDING,
  splitEssaySources,
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

export const CRITIC_MAX_TOKENS = 4096;

export const RUBRIC_ITEMS: { id: RubricId; text: string }[] = [
  {
    id: "claim",
    text: "Claim. The opening states one arguable claim. A reader can quote it.",
  },
  {
    id: "advance",
    text: "Advance. Every section moves that claim forward. No section is a source summary. When the brief asks for architecture or implementation, a section that names a mechanism without its operational bound (overflow, conflict, aging, or failure) has not moved the claim. The bound must be the failure mode of that mechanism, stated as one committed policy. A timeout or fail-open policy does not satisfy overflow of what the mechanism returns. Naming alternative policies and leaving the choice open does not pass. If the plan named a bound for a section, answering a different failure mode does not pass.",
  },
  {
    id: "objection",
    text:
      "Objection. The strongest counter to the claim is stated at full strength and answered with a mechanism, not named and dropped. Use the notes when they supply that counter. If there are no notes, use the objection a competent reader of this brief would raise.",
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
      "Silence about process. Fail only a sentence that discusses the notes, the sources as a set, the research, or the essay itself. A sentence about the subject passes. Gaps belong in the sidecar.",
  },
];

export const CRITIC_SYSTEM =
  "You judge one essay against the rubric below as the brief's intended reader, not as a checklist that prefers a pass. The brief is the rulebook. Do not invent a requirement the brief did not state. When the brief asks for architecture or implementation, operational bounds (overflow, conflict, aging, or failure) are part of explaining the claim. The bound must match the mechanism: a timeout or fail-open policy does not cover overflow of the payload that mechanism returns. A menu of alternative policies with the choice left open does not pass. If the plan named a bound for a section, fail advance unless the essay states that bound as one committed policy. Do not fail an essay for lacking sources or quotations unless the brief required them or the harness found an uncited figure or quote. If there are no notes, pass fidelity. Do not judge word count as a miss. Return JSON {items: [{id, pass, passage, fix}]} with exactly the eight ids. On fail, passage is one sentence from the essay. Fix is how to rewrite that passage in place so the item passes, not a sentence to append and not a question. On pass, passage and fix are empty.";

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
  plan = "",
): string {
  const extra = harness.length > 0
    ? `The harness already found:\n${
      harness.map((item) => `- ${item}`).join("\n")
    }\nTurn each into a passage-level fix only if it still appears in the essay.`
    : "";
  const planBlock = plan.trim()
    ? `Plan (section purposes govern architecture bounds):\n${plan.trim()}\nIf a section purpose named an operational bound, the essay must state that bound as one committed policy. Fail advance if the essay answers a different failure mode.`
    : "";
  const rubric = RUBRIC_ITEMS.map((item) => `${item.id}: ${item.text}`).join(
    "\n",
  );
  return [
    briefBlock(brief),
    extra,
    planBlock,
    rubric,
    "Return JSON {items: [{id, pass, passage, fix}]} for those eight ids. Passage is one sentence. Fix is how to rewrite that passage in place, not a sentence to append.",
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

function parseCriticJson(
  content: string,
): Record<string, unknown> | undefined {
  const direct = jsonObject(content);
  if (direct) return direct;
  const start = content.indexOf("{");
  if (start === -1) return undefined;
  let slice = content.slice(start);
  const lastBrace = slice.lastIndexOf("}");
  if (lastBrace === -1) return undefined;
  slice = slice.slice(0, lastBrace + 1);
  for (const suffix of ["", "]", "]}", "}]}"] as const) {
    try {
      const parsed: unknown = JSON.parse(slice + suffix);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function criticFromContent(content: string): CriticReview {
  const row = parseCriticJson(content);
  if (!row) {
    return { issues: [], rubric: emptyRubric() };
  }
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

export const PLAN_BOUND_PREFIX = "plan bound in: ";

export const PLAN_BOUND_FIX =
  "Rewrite this passage so it states the bound named in the plan as one committed policy in the mechanism. Do not substitute a sibling failure mode or leave a menu of policies.";

const BOUND_KINDS = ["overflow", "conflict", "aging", "failure"] as const;
type BoundKind = (typeof BOUND_KINDS)[number];

const BOUND_TERMS: Record<BoundKind, readonly string[]> = {
  overflow: [
    "overflow",
    "context window",
    "context-window",
    "token budget",
    "truncate",
    "hop cap",
    "hop-cap",
  ],
  conflict: ["conflict", "contradict", "duplicate", "dedup", "version skew"],
  aging: ["aging", "stale", "expiry", "ttl", "freshness"],
  failure: [
    "fail open",
    "fail-open",
    "fails open",
    "timeout",
    "times out",
    "timed out",
    "lock",
    "corrupt",
    "rebuild",
  ],
};

const MENU_TERMS = [
  "whichever",
  "alternative policies",
  "leave the choice",
  "choice open",
  "options include",
];

function textHas(text: string, terms: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function kindsIn(text: string): BoundKind[] {
  return BOUND_KINDS.filter((kind) => textHas(text, BOUND_TERMS[kind]));
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function locatePassage(body: string, needles: readonly string[]): string {
  const found = sentences(body).find((sentence) => textHas(sentence, needles));
  return found ?? sentences(body)[0] ?? body.slice(0, 200);
}

export function planBoundProblems(
  plan: EssayPlan | undefined,
  essay: string,
): string[] {
  if (!plan) return [];
  const named = new Set<BoundKind>();
  for (const section of plan.sections) {
    for (const kind of kindsIn(`${section.heading} ${section.purpose}`)) {
      named.add(kind);
    }
  }
  if (named.size === 0) return [];
  const body = splitEssaySources(essay).prose;
  const findings: string[] = [];
  const seen = new Set<string>();
  const push = (passage: string) => {
    const line = `${PLAN_BOUND_PREFIX}${passage}`;
    if (seen.has(line)) return;
    seen.add(line);
    findings.push(line);
  };
  if (textHas(body, MENU_TERMS)) {
    push(locatePassage(body, MENU_TERMS));
  }
  for (const kind of named) {
    if (textHas(body, BOUND_TERMS[kind])) continue;
    const sibling = BOUND_KINDS.filter((row) => row !== kind).flatMap((row) =>
      BOUND_TERMS[row]
    );
    push(locatePassage(body, sibling));
  }
  return findings;
}

export function leftoverSaveError(
  leftover: readonly string[],
): string | undefined {
  const bounds = leftover.filter((item) => item.startsWith(PLAN_BOUND_PREFIX));
  if (bounds.length === 0) return undefined;
  return `Plan bound leftover: ${
    bounds.map((item) => item.slice(PLAN_BOUND_PREFIX.length)).join(" ")
  }`;
}

export function applyPlanBounds(
  review: CriticReview,
  leftover: readonly string[],
): CriticReview {
  const bounds = leftover.filter((item) => item.startsWith(PLAN_BOUND_PREFIX));
  if (bounds.length === 0) return review;
  const passage = bounds[0].slice(PLAN_BOUND_PREFIX.length);
  const rubric = review.rubric.map((item) =>
    item.id === "advance"
      ? {
        ...item,
        pass: false,
        passage: item.passage || passage,
        fix: item.fix || PLAN_BOUND_FIX,
      }
      : item
  );
  return { issues: issuesFromRubric(rubric), rubric };
}

export function issuesFromHarness(problems: readonly string[]): CriticIssue[] {
  return problems.map((problem) => {
    const copied = problem.match(/^copied without quotes from [^:]+: (.+)$/)
      ?.[1];
    const figure = problem.match(/^figure (.+) has no citation$/)?.[1];
    const quote = problem.match(/^quote has no citation: (.+)$/)?.[1];
    const process = problem.match(/^process sentence in the body: (.+)$/)?.[1];
    const missing = problem.match(/^citation (\[n\d+\]) does not match a note$/)
      ?.[1];
    const planBound = problem.startsWith(PLAN_BOUND_PREFIX)
      ? problem.slice(PLAN_BOUND_PREFIX.length)
      : undefined;
    const overQuoted = problem.startsWith("quoted words are");
    const passage = copied ?? figure ?? quote ?? process ?? missing ??
      planBound ?? "";
    return {
      passage,
      problem,
      fix: planBound
        ? PLAN_BOUND_FIX
        : overQuoted
        ? "Paraphrase. Keep only the sharpest short quotes. Stay under 15% quoted words. Cite the notes."
        : copied
        ? `Rewrite this in your own words, or quote a short phrase if it would lose force: ${copied}`
        : process
        ? "Rewrite so the sentence does not mention the notes, the sources, or the essay itself. Keep the argument. Gaps belong in the sidecar."
        : missing
        ? `Remove ${missing}. It does not match a note.`
        : "Cite the matching note or drop the figure.",
    };
  });
}

export function leftoverIssues(
  issues: readonly CriticIssue[],
  essay: string,
): CriticIssue[] {
  return issues.filter((issue) =>
    Boolean(issue.passage) && essay.includes(issue.passage)
  );
}

export function mergeIssues(
  review: readonly CriticIssue[],
  harness: readonly CriticIssue[],
): CriticIssue[] {
  const seen = new Set(review.map((issue) => issue.problem));
  return [...review, ...harness.filter((issue) => !seen.has(issue.problem))];
}

export function editorialRewriteNotes(
  issues: readonly CriticIssue[],
): string {
  if (issues.length === 0) return "";
  return issues.map((issue) =>
    `- ${issue.problem}\n  Passage: ${issue.passage || "(locate)"}\n  Rewrite: ${issue.fix}`
  ).join("\n");
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
  const rewrite = editorialRewriteNotes(
    mergeIssues(issuesFromRubric(review.rubric), issuesFromHarness(extra)),
  );
  if (rewrite) {
    lines.push("", "Rewrite these passages:");
    lines.push(rewrite);
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
  plan?: string;
}): Promise<CriticReview> {
  if (!input.model.apiKey) {
    return { issues: [], rubric: emptyRubric() };
  }
  const messages = [
    systemMessage(
      formatAttributedNotes(input.notes),
      CRITIC_SYSTEM,
      input.brief,
    ),
    {
      role: "user" as const,
      content: criticUserPrompt(
        input.brief,
        input.essay,
        input.harness,
        input.plan,
      ),
    },
  ];
  const options = {
    temperature: 0,
    label: "critic" as const,
    maxTokens: CRITIC_MAX_TOKENS,
    meter: input.meter,
    supportedParams: input.supportedParams,
    responseFormat: CRITIC_RESPONSE_FORMAT,
  };
  try {
    return criticFromContent(
      (await streamChat(input.model, messages, options)).content,
    );
  } catch (error) {
    if (error instanceof CutOffReply) {
      return criticFromContent(error.content);
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
