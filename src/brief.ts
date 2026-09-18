import { contentWords } from "./agents/write.ts";
import { CutOffReply, type RunMeter, streamChat } from "./complete.ts";
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

export function fallbackBrief(topic: string): Brief {
  return applyBriefDefaults({
    text: topic,
    subject: searchQuery(topic),
    claim: "",
    audience: "",
    purpose: "",
    tone: "",
    constraints: [],
  });
}

export function applyBriefDefaults(brief: Brief, claim = brief.claim): Brief {
  const nextClaim = claim.trim();
  const purpose = brief.purpose.trim() ||
    (nextClaim
      ? `persuading ${brief.audience.trim() || "the reader"} of the claim`
      : "");
  return { ...brief, claim: nextClaim, purpose };
}

const ARCHITECTURE = /\barchitect(?:ure|ing|ural)?\b|\bimplementation\b|\bimplementing\b/i;
const EXPLAIN = /\bexplain(?:ing|s)?\b/i;
const NAMED_SYSTEM =
  /\b(system|product|library|framework|api|protocol|runtime|database|agent|model)\b/i;

export function researchRequired(brief: Brief): boolean {
  const blob = [
    brief.purpose,
    brief.text,
    brief.subject,
    ...brief.constraints,
  ].join(" ");
  if (ARCHITECTURE.test(blob)) return true;
  if (EXPLAIN.test(brief.purpose || brief.text) && NAMED_SYSTEM.test(blob)) {
    return true;
  }
  return false;
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
    return applyBriefDefaults({
      text: topic,
      subject: subject.trim() || searchQuery(topic),
      claim: claim.trim(),
      audience: audience.trim(),
      purpose: purpose.trim(),
      tone: tone.trim(),
      constraints: constraints.map((item) => item.trim()).filter(Boolean),
    });
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

export function counterQuery(brief: Brief): string {
  const base = researchQuery(brief);
  if (!base) return "";
  return `${base} criticism opposition debate against`.slice(0, 400);
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
