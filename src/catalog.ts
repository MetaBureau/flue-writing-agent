import type { ModelChoice } from "./providers.ts";

export const MODEL_HUB_URL = "https://api.haimaker.ai/public/model_hub";

export const DOCUMENTED_REASONING_EFFORT = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof DOCUMENTED_REASONING_EFFORT)[number];

export interface CatalogModel {
  id: string;
  supportsReasoning: boolean;
  supportedParams: string[];
  maxOutputTokens: number | undefined;
  inputCostPerToken: number | undefined;
  outputCostPerToken: number | undefined;
  mode: string | undefined;
}

export interface TokenPrice {
  inputPerToken: number;
  outputPerToken: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

export function catalogFromHub(payload: unknown): Map<string, CatalogModel> {
  const rows = Array.isArray(payload) ? payload : [];
  const catalog = new Map<string, CatalogModel>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.model_group !== "string") continue;
    catalog.set(row.model_group, {
      id: row.model_group,
      supportsReasoning: row.supports_reasoning === true,
      supportedParams: stringList(row.supported_openai_params),
      maxOutputTokens: numberOrUndefined(row.max_output_tokens),
      inputCostPerToken: numberOrUndefined(row.input_cost_per_token),
      outputCostPerToken: numberOrUndefined(row.output_cost_per_token),
      mode: typeof row.mode === "string" ? row.mode : undefined,
    });
  }
  return catalog;
}

export function idsFromModelsList(payload: unknown): Set<string> {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return new Set();
  const ids = new Set<string>();
  for (const row of payload.data) {
    if (isRecord(row) && typeof row.id === "string" && row.id) ids.add(row.id);
  }
  return ids;
}

export function reasoningEffortField(
  supportedParams: readonly string[] | undefined,
  effort: string | undefined,
): { reasoning_effort: ReasoningEffort } | Record<string, never> {
  if (effort !== "low" && effort !== "medium" && effort !== "high") return {};
  if (!supportedParams?.includes("reasoning_effort")) return {};
  return { reasoning_effort: effort };
}

function dollarsPerMillion(perToken: number): string {
  const perMillion = perToken * 1_000_000;
  const text = Number.isInteger(perMillion)
    ? String(perMillion)
    : perMillion.toFixed(2);
  return `$${text}/M out`;
}

export function pickerLabel(
  name: string,
  catalog: CatalogModel | undefined,
): string {
  const notes: string[] = [];
  if (catalog?.supportsReasoning) notes.push("can reason");
  if (catalog?.outputCostPerToken !== undefined) {
    notes.push(dollarsPerMillion(catalog.outputCostPerToken));
  }
  return notes.length > 0 ? `${name} · ${notes.join(" · ")}` : name;
}

// 2026-09-17: GET /v1/models returned OpenAI list ids in provider/model form.
// All eight picker ids matched catalog model_group. Wildcards (`*`, `xai/*`) do not.
export function pickerModels(
  curated: readonly ModelChoice[],
  catalog: Map<string, CatalogModel>,
  keyIds?: Set<string>,
): ModelChoice[] {
  const rows = keyIds
    ? curated.filter((choice) => keyIds.has(choice.id))
    : [...curated];
  return rows.map((choice) => ({
    id: choice.id,
    label: pickerLabel(choice.label, catalog.get(choice.id)),
  }));
}

export function keyListWarning(
  curated: readonly { id: string }[],
  keyIds: Set<string> | undefined,
): string {
  if (!keyIds || curated.some((choice) => keyIds.has(choice.id))) return "";
  return "This key's model list does not include the picker. Ids use the same provider/model form as the catalog, so the picker stays empty.";
}

export function pricesFromCatalog(
  catalog: Map<string, CatalogModel>,
): Map<string, TokenPrice> {
  const prices = new Map<string, TokenPrice>();
  for (const [id, model] of catalog) {
    if (
      model.inputCostPerToken === undefined ||
      model.outputCostPerToken === undefined
    ) continue;
    prices.set(id, {
      inputPerToken: model.inputCostPerToken,
      outputPerToken: model.outputCostPerToken,
    });
  }
  return prices;
}

export async function loadModelHub(): Promise<Map<string, CatalogModel>> {
  const response = await fetch(MODEL_HUB_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`model hub HTTP ${response.status}`);
  return catalogFromHub(await response.json());
}

export async function loadPrices(): Promise<Map<string, TokenPrice>> {
  try {
    return pricesFromCatalog(await loadModelHub());
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.log(`Catalog: none (${message})`);
    return new Map();
  }
}

export async function loadKeyModelIds(
  baseUrl: string,
  apiKey: string,
): Promise<Set<string>> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`models HTTP ${response.status}`);
  return idsFromModelsList(await response.json());
}
