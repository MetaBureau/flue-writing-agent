import { define } from "../define.ts";
import WriteForm from "../islands/WriteForm.tsx";
import { STYLE_NAMES } from "../src/skills/styles.ts";
import { PROVIDERS, providerKeyProblem, reloadEnv } from "../src/providers.ts";

export default define.page(async function Home() {
  await reloadEnv();
  return (
    <main class="mx-auto max-w-3xl px-4 py-10">
      <WriteForm
        styles={[...STYLE_NAMES]}
        providers={Object.keys(PROVIDERS)}
        models={Object.fromEntries(
          Object.entries(PROVIDERS).map(([name, config]) => [name, [...config.models]]),
        )}
        providerProblems={{
          haimaker: providerKeyProblem("haimaker") ?? "",
          mercury: providerKeyProblem("mercury") ?? "",
        }}
      />
    </main>
  );
});
