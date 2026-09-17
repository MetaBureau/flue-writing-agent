import {
  briefBlock,
  capEssayLength,
  contentWords,
  countWords,
  dropCallsToAction,
  isCallToAction,
  noteParagraphs,
  NOTES_GROUNDING,
  REPEAT_RATIO,
  REPETITION_FAULT,
  sharedWordRatio,
  splitEssaySources,
  systemMessage,
  synthesisTokens,
  writerFacts,
} from "./agents/write.ts";
import { CutOffReply, type RunMeter, streamChat } from "./complete.ts";
import { lengthRange } from "./contract.ts";
import { keepIfNotShortened } from "./skills/editorial.ts";
import { searchQuery } from "./notes.ts";
import type { ResolvedProvider } from "./providers.ts";

export interface Brief {
  text: string;
  subject: string;
  claim: string;
  audience: string;
  purpose: string;
  tone: string;
  constraints: string[];
}

export const BRIEF_MAX_TOKENS = 1024;
export const BRIEF_CHECK_MAX_TOKENS = 2048;

export const BRIEF_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "brief",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "subject",
        "claim",
        "audience",
        "purpose",
        "tone",
        "constraints",
      ],
      properties: {
        subject: { type: "string" },
        claim: { type: "string" },
        audience: { type: "string" },
        purpose: { type: "string" },
        tone: { type: "string" },
        constraints: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export const BRIEF_CHECK_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "brief_check",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["pass", "misses"],
      properties: {
        pass: { type: "boolean" },
        misses: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export function fallbackBrief(topic: string): Brief {
  return {
    text: topic,
    subject: searchQuery(topic),
    claim: "",
    audience: "",
    purpose: "",
    tone: "",
    constraints: [],
  };
}

function stringField(row: Record<string, unknown>, key: string): string | undefined {
  return typeof row[key] === "string" ? row[key] : undefined;
}

export function briefFromContent(content: string, topic: string): Brief | undefined {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const row = parsed as Record<string, unknown>;
    const subject = stringField(row, "subject");
    const claim = stringField(row, "claim");
    const audience = stringField(row, "audience");
    const purpose = stringField(row, "purpose");
    const tone = stringField(row, "tone");
    const constraints = row.constraints;
    if (
      subject === undefined || claim === undefined || audience === undefined ||
      purpose === undefined || tone === undefined || !Array.isArray(constraints) ||
      !constraints.every((item) => typeof item === "string")
    ) {
      return undefined;
    }
    return {
      text: topic,
      subject: subject.trim() || searchQuery(topic),
      claim: claim.trim(),
      audience: audience.trim(),
      purpose: purpose.trim(),
      tone: tone.trim(),
      constraints: constraints.map((item) => item.trim()).filter(Boolean),
    };
  } catch {
    return undefined;
  }
}

export function briefUserPrompt(topic: string): string {
  return [
    "Read the user's brief. Return JSON {subject, claim, audience, purpose, tone, constraints}.",
    "subject is what to search, without the instruction to write an essay.",
    "claim, audience, purpose, and tone are what the user asked for. Use an empty string when they did not say.",
    "constraints are limits the user stated. Use [] when they stated none.",
    "Do not invent. Do not research.",
    topic,
  ].join("\n\n");
}

export async function parseBrief(
  topic: string,
  model: ResolvedProvider,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<Brief> {
  const fallback = (reason: string): Brief => {
    console.warn(`[brief] ${reason}; using the topic as the brief`);
    return fallbackBrief(topic);
  };
  if (!model.apiKey) return fallback("no API key");
  try {
    const content = (await streamChat(model, [
      {
        role: "system",
        content:
          "Extract the writing brief. Do not invent a reader, a purpose, a tone, or a constraint.",
      },
      { role: "user", content: briefUserPrompt(topic) },
    ], {
      temperature: 0,
      label: "brief",
      maxTokens: BRIEF_MAX_TOKENS,
      meter,
      supportedParams,
      responseFormat: BRIEF_RESPONSE_FORMAT,
    })).content;
    return briefFromContent(content, topic) ?? fallback("invalid JSON");
  } catch (error) {
    if (error instanceof CutOffReply) return fallback("cut off");
    return fallback(error instanceof Error ? error.message : "parse failed");
  }
}

function briefBodyMisses(text: string, notes = ""): string[] {
  const prose = splitEssaySources(text).prose;
  const misses: string[] = [];
  if (/https?:\/\/|www\./i.test(prose) || /\[[^\]]+\]\([^)]+\)/.test(prose)) {
    misses.push("link or URL in the body");
  }
  const sentences = prose.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  if (sentences.some(isCallToAction)) {
    misses.push("pasted call to action");
  }
  if (
    notes && noteParagraphs(prose).some((paragraph) =>
      noteParagraphs(notes).some((fact) =>
        sharedWordRatio(paragraph, fact) >= REPEAT_RATIO
      )
    )
  ) {
    misses.push("pasted source text");
  }
  return misses;
}

export function researchQuery(brief: Brief): string {
  const subject = (brief.subject.trim() || searchQuery(brief.text)).replace(
    /\s+/g,
    " ",
  ).trim();
  const extra = contentWords(brief.claim).filter((word) =>
    !subject.toLowerCase().includes(word)
  );
  return [subject, ...extra].filter(Boolean).join(" ").slice(0, 400);
}

export function briefStageDetail(brief: Brief): string {
  const named = [brief.audience, brief.purpose, brief.tone].filter(Boolean);
  return named.length > 0 ? named.join(" · ") : brief.subject || "subject only";
}

export function briefSidecar(brief: Brief): string {
  return [
    "Brief:",
    brief.text,
    `Subject: ${brief.subject || "—"}`,
    `Claim: ${brief.claim || "—"}`,
    `Audience: ${brief.audience || "—"}`,
    `Purpose: ${brief.purpose || "—"}`,
    `Tone: ${brief.tone || "—"}`,
    `Constraints: ${brief.constraints.join("; ") || "—"}`,
  ].join("\n");
}

export interface BriefVerdict {
  pass: boolean;
  misses: string[];
}

export function isLengthMiss(miss: string): boolean {
  return /\b\d[\d,]*\s*-?\s*words?\b/i.test(miss) ||
    /\b(?:word count|too short|too long|approximately \d+)/i.test(miss);
}

export function briefMustRevise(
  verdict: BriefVerdict,
  essay: string,
  notes = "",
): boolean {
  const kept = verdict.misses.filter((miss) => !isLengthMiss(miss));
  if (briefBodyMisses(essay, notes).length > 0) return true;
  if (kept.length > 0) return true;
  return !verdict.pass && verdict.misses.length === 0;
}

export function briefCheckFromContent(content: string): BriefVerdict | undefined {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const row = parsed as Record<string, unknown>;
    if (typeof row.pass !== "boolean" || !Array.isArray(row.misses)) {
      return undefined;
    }
    if (!row.misses.every((item) => typeof item === "string")) return undefined;
    return {
      pass: row.pass,
      misses: row.misses.map((item) => item.trim()).filter(Boolean),
    };
  } catch {
    return undefined;
  }
}

export const BRIEF_CHECK_RULE =
  "Cover audience, purpose, tone, claim, and constraints. Fail pasted source text, a source headline or question, a link or URL in the body, a call to action, and a stretch that does not serve the claim. When the purpose is amusement, fail a solemn or merely elevated tone. A pass needs actual wit: irony, a joke, or a comic turn. Elevated diction is not enough. Do not judge length or word count.";

function briefForCheck(brief: Brief): Brief {
  return {
    ...brief,
    constraints: brief.constraints.filter((item) => !isLengthMiss(item)),
  };
}

export function briefCheckUserPrompt(brief: Brief, essay: string): string {
  const words = countWords(splitEssaySources(essay).prose);
  return [
    briefBlock(briefForCheck(brief)),
    `Measured length: ${words} words. That count is a fact. Do not judge length or word count, and do not list either as a miss.`,
    `Judge this essay against the brief. ${BRIEF_CHECK_RULE}`,
    "Return JSON {pass: boolean, misses: string[]}. misses lists what the essay failed to serve. Empty when pass is true.",
    essay.trim(),
  ].join("\n\n");
}

export function briefRevisionUserPrompt(
  brief: Brief,
  essay: string,
  misses: readonly string[],
  target = 0,
): string {
  const words = countWords(splitEssaySources(essay).prose);
  const bounds = target > 0
    ? `The essay is ${words} words. ${lengthRange(target)}`
    : `The essay is ${words} words. Do not guess the count.`;
  return [
    briefBlock(briefForCheck(brief)),
    "Write the essay the brief asks for.",
    "The check missed:",
    ...misses.map((miss) => `- ${miss}`),
    bounds,
    `${REPETITION_FAULT} Keep facts already in the essay. Do not paste source text, a source headline, a question from the notes, a call to action, or a URL. End with a complete sentence. Return only the essay.`,
    essay.trim(),
  ].join("\n\n");
}

export interface BriefCheckResult {
  text: string;
  pass: boolean;
  misses: string[];
  skipped: boolean;
  revised: boolean;
  detail: string;
}

export function briefcheckSidecar(result: BriefCheckResult): string {
  const lines = ["Brief check:", result.detail];
  if (result.misses.length > 0) {
    lines.push(...result.misses.map((miss) => `- ${miss}`));
  }
  lines.push(result.revised ? "Revision kept." : "Revision not kept.");
  return lines.join("\n");
}

function skippedCheck(text: string, detail: string): BriefCheckResult {
  return {
    text,
    pass: false,
    misses: [],
    skipped: true,
    revised: false,
    detail,
  };
}

export async function enforceBrief(input: {
  essay: string;
  brief: Brief;
  notes: string;
  checker: ResolvedProvider;
  mercury: ResolvedProvider;
  writer: ResolvedProvider;
  floorWords: number;
  wordCountTarget: number;
  meter?: RunMeter;
  supportedParams?: readonly string[];
}): Promise<BriefCheckResult> {
  const essay = capEssayLength(input.essay.trim(), input.wordCountTarget);
  if (!input.checker.apiKey) {
    return skippedCheck(essay, "no HaiMaker key; not checked");
  }
  let verdict: BriefVerdict | undefined;
  try {
    const content = (await streamChat(input.checker, [
      {
        role: "system",
        content: `${briefBlock(input.brief)}\n\nJudge the essay against that brief. ${BRIEF_CHECK_RULE} Return JSON only.`,
        cachedPrefix: briefBlock(input.brief),
      },
      { role: "user", content: briefCheckUserPrompt(input.brief, essay) },
    ], {
      temperature: 0,
      label: "briefcheck",
      maxTokens: BRIEF_CHECK_MAX_TOKENS,
      meter: input.meter,
      supportedParams: input.supportedParams,
      responseFormat: BRIEF_CHECK_FORMAT,
    })).content;
    verdict = briefCheckFromContent(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "brief-check failed";
    console.warn(`[briefcheck] ${message}`);
    return skippedCheck(essay, message);
  }
  if (!verdict) return skippedCheck(essay, "brief-check returned no verdict");
  const misses = [
    ...verdict.misses.filter((miss) => !isLengthMiss(miss)),
    ...briefBodyMisses(essay, input.notes).filter((miss) =>
      !verdict.misses.includes(miss)
    ),
  ];
  if (!briefMustRevise(verdict, essay, input.notes)) {
    return {
      text: essay,
      pass: true,
      misses: [],
      skipped: false,
      revised: false,
      detail: "pass",
    };
  }
  const reviser = input.mercury.apiKey ? input.mercury : input.writer;
  if (!reviser.apiKey) {
    console.warn("[briefcheck] no revision model; kept original");
    return {
      text: essay,
      pass: false,
      misses: misses,
      skipped: false,
      revised: false,
      detail: "failed · kept original",
    };
  }
  let revised = "";
  try {
    revised = (await streamChat(reviser, [
      systemMessage(
        writerFacts(input.notes),
        `Revise the essay so it serves the brief. ${NOTES_GROUNDING} ${REPETITION_FAULT} Keep facts already in the essay. Do not paste source text, a source headline, or a URL. Return only the essay.`,
        input.brief,
      ),
      {
        role: "user",
        content: briefRevisionUserPrompt(
          input.brief,
          essay,
          misses,
          input.wordCountTarget,
        ),
      },
    ], {
      temperature: 0.3,
      label: "briefcheck:revise",
      maxTokens: synthesisTokens(
        input.wordCountTarget,
        Boolean(input.mercury.apiKey),
      ),
      meter: input.meter,
    })).content;
  } catch (error) {
    if (!(error instanceof CutOffReply)) {
      const message = error instanceof Error ? error.message : "revision failed";
      console.warn(`[briefcheck] ${message}`);
    } else {
      console.warn("[briefcheck] revision cut off; kept original");
    }
    return {
      text: essay,
      pass: false,
      misses: misses,
      skipped: false,
      revised: false,
      detail: "failed · kept original",
    };
  }
  const kept = keepIfNotShortened(essay, revised, input.floorWords);
  if (kept.trim() !== revised.trim()) {
    console.warn("[briefcheck] revision rejected; kept original");
    return {
      text: essay,
      pass: false,
      misses: misses,
      skipped: false,
      revised: false,
      detail: "failed · kept original",
    };
  }
  return {
    text: capEssayLength(
      dropCallsToAction(kept.trim()),
      input.wordCountTarget,
    ),
    pass: false,
    misses,
    skipped: false,
    revised: true,
    detail: `revised · ${misses.length} misses`,
  };
}
