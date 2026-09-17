import {
  describesSourcePage,
  notesPrefix,
  sharedWordRatio,
} from "./agents/write.ts";
import { CutOffReply, type RunMeter, streamChat } from "./complete.ts";
import type { SearchHit } from "./notes.ts";
import {
  DRAFT_MODELS,
  PROVIDERS,
  type ResolvedProvider,
  resolveProvider,
} from "./providers.ts";

export type ClaimStatus = "supported" | "unsupported" | "not-a-claim";

export interface ClaimVerdict {
  text: string;
  status: ClaimStatus;
  url: string;
}

function claimStatus(value: unknown): ClaimStatus | undefined {
  if (
    value === "supported" || value === "unsupported" || value === "not-a-claim"
  ) {
    return value;
  }
  return undefined;
}

export const FACTCHECK_RULE =
  "Check only checkable specifics: numbers, dates, named studies, quotes, and attributed claims. Mark those supported when a note URL backs them, unsupported when the notes do not. Mark argument, interpretation, examples, transitions, and widely known general knowledge as not-a-claim.";

export const DEFAULT_CHECK_MODEL = "google/gemini-3.1-flash-lite";
const CHECK_FALLBACK = "openai/gpt-4.1";

export interface FactCheckResult {
  text: string;
  supported: number;
  unsupported: number;
  unchecked: number;
  unsupportedClaims: string[];
  uncheckedClaims: string[];
  checked: boolean;
  detail: string;
  modelId?: string;
}

export function splitClaims(text: string): string[] {
  const prose = text.split(/\n## Sources\s*\n/)[0] ?? text;
  return prose
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      sentence.length > 0 && !sentence.startsWith("#") &&
      !/^\d+ words\.?$/i.test(sentence) &&
      sentence.split(/\s+/).length >= 8
    );
}

export function citableHits(hits: readonly SearchHit[]): SearchHit[] {
  return hits.filter((hit) => hit.url && !describesSourcePage(hit.content));
}

export const CLAIM_BATCH_SIZE = 25;

export function claimBatches(
  claims: readonly string[],
  size = CLAIM_BATCH_SIZE,
): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < claims.length; i += size) {
    batches.push(claims.slice(i, i + size));
  }
  return batches;
}

export function factcheckTokenCap(claimCount: number): number {
  return Math.min(8192, Math.max(256, claimCount * 80 + 128));
}

function claimIndex(value: unknown): number | undefined {
  const index = typeof value === "number" ? value : Number(value);
  return Number.isInteger(index) && index >= 1 ? index : undefined;
}

export function verdictsFromContent(
  content: string,
  claims: readonly string[] = [],
): ClaimVerdict[] {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    if (
      typeof parsed !== "object" || parsed === null || !("claims" in parsed)
    ) {
      return [];
    }
    const rows = (parsed as { claims: unknown }).claims;
    if (!Array.isArray(rows)) return [];
    const verdicts: ClaimVerdict[] = [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const index = "i" in row ? claimIndex(row.i) : undefined;
      const numbered = index ? claims[index - 1] : undefined;
      const text = numbered ||
        ("text" in row && typeof row.text === "string" ? row.text : "");
      const status = "status" in row ? claimStatus(row.status) : undefined;
      const url = "url" in row && typeof row.url === "string" ? row.url : "";
      if (!text || !status) continue;
      verdicts.push({ text, status, url });
    }
    return verdicts;
  } catch {
    return [];
  }
}

export function markdownLink(title: string, url: string): string {
  const label = title.replace(/[\[\]]/g, (mark) => `\\${mark}`);
  const target = url.replace(/\)/g, "%29");
  return `[${label}](${target})`;
}

function listedCheckModel(id: string): boolean {
  return PROVIDERS.haimaker.models.some((model) => model.id === id);
}

function envCheckModel(): string {
  const fromEnv = rawCheckModel();
  return listedCheckModel(fromEnv) ? fromEnv : "";
}

function rawCheckModel(): string {
  return Deno.env.get("CHECK_MODEL")?.trim() ?? "";
}

export function checkerReplacement(
  asked: string,
  used: string,
  label = "checker",
): string | undefined {
  if (!asked || asked === used) return undefined;
  if (!listedCheckModel(asked)) {
    return `${label} ${asked} is not a HaiMaker model; using ${used}`;
  }
  if ((DRAFT_MODELS as readonly string[]).includes(asked)) {
    return `${label} ${asked} matches a drafter; using ${used}`;
  }
  return `${label} ${asked} matches the writer; using ${used}`;
}

function clashesWithDrafter(id: string): boolean {
  return (DRAFT_MODELS as readonly string[]).includes(id);
}

export function checkModelId(
  _writerModelId: string,
  requested?: string,
): string {
  const chosen = requested?.trim() || envCheckModel() || DEFAULT_CHECK_MODEL;
  const id = listedCheckModel(chosen) ? chosen : DEFAULT_CHECK_MODEL;
  if (!clashesWithDrafter(id)) return id;
  if (!clashesWithDrafter(DEFAULT_CHECK_MODEL)) return DEFAULT_CHECK_MODEL;
  return listedCheckModel(CHECK_FALLBACK) && !clashesWithDrafter(CHECK_FALLBACK)
    ? CHECK_FALLBACK
    : PROVIDERS.haimaker.models.find((model) => !clashesWithDrafter(model.id))
      ?.id ?? DEFAULT_CHECK_MODEL;
}

export interface CheckerTarget extends ResolvedProvider {
  note?: string;
}

export function resolveChecker(
  writerModelId: string,
  requested?: string,
): CheckerTarget {
  const modelId = checkModelId(writerModelId, requested);
  const asked = requested?.trim() || rawCheckModel();
  const label = requested?.trim() ? "checker" : "CHECK_MODEL";
  const note = asked ? checkerReplacement(asked, modelId, label) : undefined;
  if (note) console.log(note);
  return { ...resolveProvider("haimaker", "fast", modelId), note };
}

export function uncheckedResult(
  text: string,
  detail: string,
  modelId?: string,
): FactCheckResult {
  const claims = splitClaims(text);
  return {
    text,
    supported: 0,
    unsupported: 0,
    unchecked: claims.length,
    unsupportedClaims: [],
    uncheckedClaims: claims,
    checked: false,
    detail,
    modelId,
  };
}

export function factcheckRecord(result: FactCheckResult): string {
  const lines = [
    `Checker: ${result.modelId ?? "none"}`,
    result.detail,
  ];
  if (result.unsupportedClaims.length > 0) {
    lines.push(
      "",
      "Unsupported:",
      ...result.unsupportedClaims.map((claim) => `- ${claim}`),
    );
  }
  if (result.uncheckedClaims.length > 0) {
    lines.push(
      "",
      "Unchecked:",
      ...result.uncheckedClaims.map((claim) => `- ${claim}`),
    );
  }
  return lines.join("\n");
}

export function applyFactCheck(
  text: string,
  verdicts: readonly ClaimVerdict[],
  hits: readonly SearchHit[],
): FactCheckResult {
  const allowed = new Map(hits.map((hit) => [hit.url, hit]));
  const cited = new Map<string, SearchHit>();
  const unsupportedClaims: string[] = [];
  const uncheckedClaims: string[] = [];
  let result = text;
  let supported = 0;
  for (const claim of splitClaims(text)) {
    const verdict = verdicts.find((item) =>
      sharedWordRatio(claim, item.text) >= 0.6
    );
    if (!verdict) {
      uncheckedClaims.push(claim);
      continue;
    }
    if (verdict.status === "not-a-claim") continue;
    const hit = verdict.url ? allowed.get(verdict.url) : undefined;
    if (verdict.status === "supported" && hit) {
      supported += 1;
      cited.set(hit.url, hit);
      continue;
    }
    unsupportedClaims.push(claim);
  }
  if (cited.size > 0) {
    const lines = [...cited.values()].map((hit) =>
      `- ${markdownLink(hit.title, hit.url)}`
    );
    result = `${result.trim()}\n\n## Sources\n\n${lines.join("\n")}\n`;
  }
  return {
    text: result,
    supported,
    unsupported: unsupportedClaims.length,
    unchecked: uncheckedClaims.length,
    unsupportedClaims,
    uncheckedClaims,
    checked: true,
    detail:
      `${supported} cited · ${unsupportedClaims.length} unsupported · ${uncheckedClaims.length} unchecked`,
  };
}

export function factcheckUserPrompt(
  claims: readonly string[],
  start = 1,
): string {
  return [
    "Check these claims against the notes. Return JSON {claims: [{i, status, url}]}.",
    "i is the claim number shown below. Do not repeat the claim text. status is supported, unsupported, or not-a-claim. url must be a URL from the notes, or empty.",
    FACTCHECK_RULE,
    claims.map((claim, index) => `${start + index}. ${claim}`).join("\n"),
  ].join("\n\n");
}

export async function checkClaims(
  text: string,
  hits: readonly SearchHit[],
  model: ResolvedProvider,
  notes: string,
  meter?: RunMeter,
): Promise<FactCheckResult> {
  const claims = splitClaims(text);
  const skipped = {
    text,
    supported: 0,
    unsupported: 0,
    unchecked: claims.length,
    unsupportedClaims: [] as string[],
    uncheckedClaims: claims,
    checked: false,
    modelId: model.modelId,
  };
  if (!model.apiKey) {
    return uncheckedResult(text, "no HaiMaker key; not checked", model.modelId);
  }
  if (hits.length === 0) {
    return { ...skipped, detail: "no sources to check" };
  }
  const batches = claimBatches(claims);
  let cutOff = false;
  let verdicts: ClaimVerdict[] = [];
  try {
    const parts = await Promise.all(batches.map(async (batch, index) => {
      const start = index * CLAIM_BATCH_SIZE + 1;
      try {
        const content = (await streamChat(model, [
          {
            role: "system",
            content: `${notesPrefix(notes)}\n\nMatch claims to those notes. ${FACTCHECK_RULE}`,
            cachedPrefix: notesPrefix(notes),
          },
          { role: "user", content: factcheckUserPrompt(batch, start) },
        ], {
          temperature: 0,
          label: batches.length > 1
            ? `factcheck:${index + 1}`
            : "factcheck",
          maxTokens: factcheckTokenCap(batch.length),
          meter,
        })).content;
        return verdictsFromContent(content, claims);
      } catch (error) {
        if (error instanceof CutOffReply) {
          cutOff = true;
          console.warn(`[factcheck] batch ${index + 1} cut off`);
          return [];
        }
        throw error;
      }
    }));
    verdicts = parts.flat();
  } catch (error) {
    if (error instanceof CutOffReply) {
      return { ...skipped, detail: error.message };
    }
    throw error;
  }
  if (verdicts.length === 0) {
    return {
      ...skipped,
      detail: cutOff
        ? "fact-check was cut off"
        : "fact-check returned no claims",
    };
  }
  const checked = {
    ...applyFactCheck(text, verdicts, hits),
    modelId: model.modelId,
  };
  if (cutOff) checked.detail = `${checked.detail} · a batch was cut off`;
  return checked;
}
