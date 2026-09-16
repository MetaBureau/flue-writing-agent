export interface ProviderConfig {
  defaultModelId: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  modelEnvVar: string;
  urlEnvVar: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  haimaker: {
    defaultModelId: "google/gemini-3.1-flash-lite",
    baseUrl: "https://api.haimaker.ai/v1",
    apiKeyEnvVar: "HAIMAKER_API_KEY",
    modelEnvVar: "HAIMAKER_MODEL_ID",
    urlEnvVar: "HAIMAKER_BASE_URL",
  },
  mercury: {
    defaultModelId: "mercury-2.5",
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

export function resolveProvider(
  providerName: string,
  type: "fast" | "reasoning",
): ResolvedProvider {
  const config = PROVIDERS[providerName] ?? PROVIDERS.mercury;
  const useShared = sharedEnv(providerName, type);

  const modelId = Deno.env.get(config.modelEnvVar) ||
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
