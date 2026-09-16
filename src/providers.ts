export interface ModelChoice {
  id: string;
  label: string;
}

export interface ProviderConfig {
  defaultModelId: string;
  models: readonly ModelChoice[];
  baseUrl: string;
  apiKeyEnvVar: string;
  modelEnvVar: string;
  urlEnvVar: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  haimaker: {
    defaultModelId: "google/gemini-3.1-flash-lite",
    models: [
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { id: "openai/gpt-5.4-mini", label: "GPT-5.4 mini" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
    ],
    baseUrl: "https://api.haimaker.ai/v1",
    apiKeyEnvVar: "HAIMAKER_API_KEY",
    modelEnvVar: "HAIMAKER_MODEL_ID",
    urlEnvVar: "HAIMAKER_BASE_URL",
  },
  mercury: {
    defaultModelId: "mercury-2.5",
    models: [{ id: "mercury-2.5", label: "Mercury 2.5" }],
    baseUrl: "https://api.inceptionlabs.ai/v1",
    apiKeyEnvVar: "MERCURY_API_KEY",
    modelEnvVar: "MERCURY_MODEL_ID",
    urlEnvVar: "MERCURY_BASE_URL",
  },
};

export interface ResolvedProvider {
  name: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKey: string | undefined;
}

const NAMES: Record<string, string> = {
  haimaker: "HaiMaker",
  mercury: "Mercury",
};

function sharedEnv(providerName: string, type: "fast" | "reasoning"): boolean {
  const configured = Deno.env.get(type === "fast" ? "FAST_PROVIDER" : "REASONING_PROVIDER");
  return configured === providerName;
}

export function isProviderModel(providerName: string, modelId: string): boolean {
  return PROVIDERS[providerName]?.models.some((model) => model.id === modelId) ?? false;
}

export function resolveProvider(
  providerName: string,
  type: "fast" | "reasoning",
  modelOverride?: string,
): ResolvedProvider {
  const config = PROVIDERS[providerName] ?? PROVIDERS.mercury;
  const useShared = sharedEnv(providerName, type);

  const modelId = modelOverride || Deno.env.get(config.modelEnvVar) ||
    (useShared ? Deno.env.get(type === "fast" ? "FAST_MODEL_ID" : "REASONING_MODEL_ID") : undefined) ||
    config.defaultModelId;

  const baseUrl = Deno.env.get(config.urlEnvVar) ||
    (useShared
      ? Deno.env.get(type === "fast" ? "FAST_MODEL_URL" : "REASONING_URL")
      : undefined) ||
    config.baseUrl;

  const apiKey = Deno.env.get(config.apiKeyEnvVar) ||
    (useShared
      ? Deno.env.get(type === "fast" ? "FAST_MODEL_KEY" : "REASONING_MODEL_KEY")
      : undefined);

  return {
    name: NAMES[providerName] ?? providerName,
    provider: providerName,
    modelId,
    baseUrl,
    apiKey,
  };
}

export async function reloadEnv(): Promise<void> {
  const { load } = await import("jsr:@std/dotenv@^0.225.6");
  await load({ export: true, envPath: ".env" });
}

export function providerKeyProblem(providerName: string): string | undefined {
  const resolved = resolveProvider(providerName, "fast");
  const key = resolved.apiKey ?? "";
  if (!key) return `${resolved.name} key is not set.`;
  return undefined;
}
