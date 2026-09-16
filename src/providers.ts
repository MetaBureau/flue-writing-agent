// Provider registry with unified configuration
export interface ProviderConfig {
  defaultModelId: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  providerEnvVar: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  haimaker: {
    defaultModelId: "haimaker/auto",
    baseUrl: "https://api.haimaker.com/v1",
    apiKeyEnvVar: "FAST_MODEL_KEY",
    providerEnvVar: "FAST_PROVIDER",
  },
  mercury: {
    defaultModelId: "mercury-2.5",
    baseUrl: "https://api.inceptionlabs.ai/v1",
    apiKeyEnvVar: "FAST_MODEL_KEY",
    providerEnvVar: "FAST_PROVIDER",
  },
};

export interface ResolvedProvider {
  name: string;
  provider: string;
  modelId: string;
  baseUrl: string;
  apiKey: string | undefined;
}

export function resolveProvider(
  providerName: string,
  type: "fast" | "reasoning"
): ResolvedProvider {
  const config = PROVIDERS[providerName] || PROVIDERS.haimaker;
  
  // Allow per-type model override
  const modelId = Deno.env.get(type === "fast" ? "FAST_MODEL_ID" : "REASONING_MODEL_ID") || config.defaultModelId;
  const baseUrl = Deno.env.get(type === "fast" ? "FAST_MODEL_URL" : "REASONING_URL") || config.baseUrl;
  const apiKey = Deno.env.get(type === "fast" ? "FAST_MODEL_KEY" : "REASONING_MODEL_KEY");

  return {
    name: providerName === "haimaker" ? "HaiMaker" : 
          providerName === "mercury" ? "Mercury" :
          providerName === "openrouter" ? "OpenRouter" : "Together",
    provider: providerName,
    modelId,
    baseUrl,
    apiKey,
  };
}
