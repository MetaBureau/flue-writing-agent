import { describesSourcePage, sharedWordRatio, systemMessage } from "./agents/write.ts";
import { CutOffReply, type RunMeter, streamChat } from "./complete.ts";
import type { SearchHit } from "./notes.ts";
import { PROVIDERS, type ResolvedProvider, resolveProvider } from "./providers.ts";

export interface ClaimVerdict {
  text: string;
  status: "supported" | "unsupported";
  url: string;
}

export const DEFAULT_CHECK_MODEL = "openai/gpt-4.1";

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
  return text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      sentence.length > 0 && !sentence.startsWith("#") &&
      sentence.split(/\s+/).length >= 8
    );
}

export function citableHits(hits: readonly SearchHit[]): SearchHit[] {
  return hits.filter((hit) => hit.url && !describesSourcePage(hit.content));
}

export function verdictsFromContent(content: string): ClaimVerdict[] {
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
    const claims = (parsed as { claims: unknown }).claims;
    if (!Array.isArray(claims)) return [];
    const verdicts: ClaimVerdict[] = [];
    for (const row of claims) {
      if (typeof row !== "object" || row === null) continue;
      const text = "text" in row && typeof row.text === "string"
        ? row.text
        : "";
      const status = "status" in row && row.status === "supported"
        ? "supported"
        : "status" in row && row.status === "unsupported"
        ? "unsupported"
        : undefined;
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
  return `${label} ${asked} matches the writer; using ${used}`;
}

export function checkModelId(writerModelId: string, requested?: string): string {
  const chosen = requested?.trim() || envCheckModel() || DEFAULT_CHECK_MODEL;
  const id = listedCheckModel(chosen) ? chosen : DEFAULT_CHECK_MODEL;
  if (id !== writerModelId) return id;
  if (id !== DEFAULT_CHECK_MODEL) return DEFAULT_CHECK_MODEL;
  return PROVIDERS.haimaker.models.find((model) => model.id !== writerModelId)
    ?.id ?? "google/gemini-3.1-flash-lite";
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
    lines.push("", "Unsupported:", ...result.unsupportedClaims.map((claim) => `- ${claim}`));
  }
  if (result.uncheckedClaims.length > 0) {
    lines.push("", "Unchecked:", ...result.uncheckedClaims.map((claim) => `- ${claim}`));
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
    const hit = verdict.url ? allowed.get(verdict.url) : undefined;
    if (verdict.status === "supported" && hit) {
      supported += 1;
      cited.set(hit.url, hit);
      const link = markdownLink(hit.title, hit.url);
      result = result.replace(claim, () => `${claim} (${link})`);
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

export function factcheckUserPrompt(claims: readonly string[]): string {
  return [
    "Check these claims against the notes. Return JSON {claims: [{text, status, url}]}.",
    "status is supported or unsupported. url must be a URL from the notes, or empty.",
    "A claim is supported only when a note excerpt states it. Do not add facts.",
    claims.map((claim, index) => `${index + 1}. ${claim}`).join("\n"),
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
  try {
    const content = (await streamChat(model, [
      systemMessage(notes, "Match claims to those notes. Do not add facts."),
      { role: "user", content: factcheckUserPrompt(claims) },
    ], {
      temperature: 0,
      label: "factcheck",
      maxTokens: 4096,
      meter,
    })).content;
    const verdicts = verdictsFromContent(content);
    if (verdicts.length === 0) {
      return { ...skipped, detail: "fact-check returned no claims" };
    }
    return { ...applyFactCheck(text, verdicts, hits), modelId: model.modelId };
  } catch (error) {
    if (error instanceof CutOffReply) {
      return { ...skipped, detail: error.message };
    }
    throw error;
  }
}
