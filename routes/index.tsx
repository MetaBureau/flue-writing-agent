import { define } from "../define.ts";
import WriteForm from "../islands/WriteForm.tsx";
import {
  keyListWarning,
  loadKeyModelIds,
  loadModelHub,
  pickerModels,
} from "../src/catalog.ts";
import { STYLE_NAMES } from "../src/skills/styles.ts";
import {
  providerKeyProblem,
  PROVIDERS,
  reloadEnv,
  resolveProvider,
} from "../src/providers.ts";

async function haimakerChoices(): Promise<{
  models: ReturnType<typeof pickerModels>;
  warning: string;
}> {
  const curated = PROVIDERS.haimaker.models;
  try {
    const hub = await loadModelHub();
    const resolved = resolveProvider("haimaker", "fast");
    const keyIds = resolved.apiKey
      ? await loadKeyModelIds(resolved.baseUrl, resolved.apiKey).catch(() =>
        undefined
      )
      : undefined;
    return {
      models: pickerModels(curated, hub, keyIds),
      warning: keyListWarning(curated, keyIds),
    };
  } catch {
    return { models: [...curated], warning: "" };
  }
}

export default define.page(async function Home() {
  await reloadEnv();
  const models = Object.fromEntries(
    Object.entries(PROVIDERS).map((
      [name, config],
    ) => [name, [...config.models]]),
  );
  const haimaker = await haimakerChoices();
  models.haimaker = haimaker.models;
  return (
    <main class="mx-auto max-w-3xl px-4 py-10">
      <WriteForm
        styles={[...STYLE_NAMES]}
        providers={Object.keys(PROVIDERS)}
        models={models}
        providerProblems={{
          haimaker: providerKeyProblem("haimaker") ?? haimaker.warning,
          mercury: providerKeyProblem("mercury") ?? "",
        }}
      />
    </main>
  );
});
