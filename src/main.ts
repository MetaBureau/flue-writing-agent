/// <reference lib="deno.ns" />
import {
  countWords,
  draftingNotes,
  essayMarkdown,
  extendDraft,
  generateDrafts,
  generateOutline,
  notesRecord,
  pickDraft,
  stripLeadingTitle,
} from "./agents/write.ts";
import { loadModelHub, pricesFromCatalog } from "./catalog.ts";
import {
  checkClaims,
  citableHits,
  factcheckRecord,
  resolveChecker,
} from "./factcheck.ts";
import { formatRun, RunMeter } from "./complete.ts";
import { applyEditorialStyle } from "./skills/editorial.ts";
import { gatherResearch } from "./research.ts";
import { isProviderModel, PROVIDERS, resolveProvider } from "./providers.ts";

interface Args {
  topic: string;
  provider?: string;
  model?: string;
  checkModel?: string;
  style: "economist" | "strunk-white" | "monocle" | "professional";
  outputFormat: "markdown" | "json" | "plain";
  verbose: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const raw = Deno.args;
  const args: Partial<Args> = {
    style: "professional",
    outputFormat: "markdown",
    verbose: false,
    dryRun: false,
  };

  let topic: string | undefined;
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--provider" && raw[i + 1]) {
      args.provider = raw[++i];
    } else if (arg === "--model" && raw[i + 1]) {
      args.model = raw[++i];
    } else if (arg === "--check-model" && raw[i + 1]) {
      args.checkModel = raw[++i];
    } else if (arg === "--style" && raw[i + 1]) {
      args.style = raw[++i] as Args["style"];
    } else if (arg === "--format" && raw[i + 1]) {
      args.outputFormat = raw[++i] as Args["outputFormat"];
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (!arg.startsWith("-") && !topic) {
      topic = arg;
    }
  }

  if (!topic) {
    console.log("Usage: deno task start <topic> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --provider <name>   Provider: haimaker, mercury");
    console.log(
      "  --model <id>        Model id from the provider's list (e.g. openai/gpt-4.1)",
    );
    console.log(
      "  --check-model <id>  HaiMaker model for fact-check (default openai/gpt-4.1)",
    );
    console.log(
      "  --style <name>      Style: economist, strunk-white, monocle, professional",
    );
    console.log("  --format <fmt>      Output: markdown, json, plain");
    console.log("  --verbose           Show detailed progress");
    console.log("  --dry-run           Show config without running");
    console.log("");
    console.log("Provider configuration via environment variables:");
    for (const [name, cfg] of Object.entries(PROVIDERS)) {
      console.log(`  --provider ${name}`);
      console.log(`  ${cfg.apiKeyEnvVar}=...`);
      console.log(`  ${cfg.modelEnvVar}=${cfg.defaultModelId}`);
      console.log(`  ${cfg.urlEnvVar}=${cfg.baseUrl}`);
      console.log(
        `  models: ${cfg.models.map((model) => model.id).join(", ")}`,
      );
      console.log("");
    }
    Deno.exit(1);
  }

  return { ...args, topic } as Args;
}

export async function writeEssay(input: {
  topic: string;
  style: Args["style"];
  provider?: string;
  model?: string;
}): Promise<string> {
  const formatted = await runWritingWorkflow({
    topic: input.topic,
    style: input.style,
    provider: input.provider,
    model: input.model,
    outputFormat: "markdown",
    verbose: true,
    dryRun: false,
  });
  if (!formatted) throw new Error("The writer returned no essay.");
  return formatted;
}

function log(args: Args, phase: string, detail: string) {
  if (args.verbose) {
    console.log(`[PHASE] ${phase}: ${detail}`);
  }
}

function formatOutput(args: Args, content: string) {
  const body = stripLeadingTitle(content);
  if (args.outputFormat === "json") {
    return JSON.stringify(
      {
        topic: args.topic,
        style: args.style,
        content: body,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  } else if (args.outputFormat === "markdown") {
    return essayMarkdown(args.topic, body);
  } else {
    return body;
  }
}

export async function writeOutputFile(
  path: string,
  body: string,
): Promise<void> {
  await Deno.mkdir("output", { recursive: true });
  const tempPath = `${path}.tmp`;
  await Deno.writeTextFile(tempPath, body);
  await Deno.rename(tempPath, path);
}

export { countWords } from "./agents/write.ts";

export function topicSlug(topic: string): string {
  const sixWords = topic.trim().split(/\s+/).slice(0, 6).join(" ");
  return sixWords
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function runWritingWorkflow(args: Args) {
  const providerName = args.provider ||
    (Deno.env.get("FAST_PROVIDER") as keyof typeof PROVIDERS) ||
    "mercury";

  if (args.checkModel && !isProviderModel("haimaker", args.checkModel)) {
    throw new Error("Unknown checker model.");
  }
  const fastProvider = resolveProvider(providerName, "fast", args.model);
  const reasoningProvider = resolveProvider(
    providerName,
    "reasoning",
    args.model,
  );

  if (args.dryRun) {
    console.log("=== Configuration (dry run) ===");
    console.log(`Topic: ${args.topic}`);
    console.log(`Provider: ${providerName}`);
    console.log(`Style: ${args.style}`);
    console.log(
      `Fast Model: ${fastProvider.modelId} (${fastProvider.baseUrl})`,
    );
    console.log(
      `Reasoning Model: ${reasoningProvider.modelId} (${reasoningProvider.baseUrl})`,
    );
    console.log(
      `Checker: ${resolveChecker(fastProvider.modelId, args.checkModel).modelId}`,
    );
    console.log(`Output Format: ${args.outputFormat}`);
    console.log(`Verbose: ${args.verbose}`);
    console.log(
      `Research: ${Deno.env.get("TAVILY_API_KEY") ? "api key" : "keyless"}`,
    );
    return;
  }

  log(args, "research", "Searching the web with Tavily");
  const research = await gatherResearch(args.topic);
  if (research.count > 0) console.log(`Research: ${research.count} sources`);
  const notes = {
    text: draftingNotes(
      [args.topic, research.text].filter(Boolean).join("\n\n"),
    ),
    topic: args.topic,
  };

  const catalog = await loadModelHub().catch(() => new Map());
  const prices = pricesFromCatalog(catalog);
  const meter = new RunMeter();
  const cost = () => formatRun(meter, prices);
  try {
    log(args, "outline", `Generating structure with ${reasoningProvider.name}`);
    const outline = await generateOutline(
      {},
      notes,
      reasoningProvider,
      meter,
      catalog.get(reasoningProvider.modelId)?.supportedParams,
    );
    console.log(cost());

    log(args, "drafts", `Creating variations with ${fastProvider.name}`);
    const drafts = await generateDrafts(
      {},
      outline,
      fastProvider,
      notes,
      meter,
    );
    console.log(cost());

    log(args, "selection", "Choosing draft by style voice");
    const selected = pickDraft(drafts, args.style);
    const draft = stripLeadingTitle(selected.content);
    console.log(
      `[draft:${selected.style}] ${countWords(draft)} words before extend`,
    );

    log(args, "extend", "Adding unused facts from the notes");
    const extended = await extendDraft(
      draft,
      notes.text,
      outline.wordCountTarget,
      fastProvider,
      "extend",
      meter,
    );
    console.log(cost());

    log(args, "style", `Applying ${args.style} editorial rules`);
    const finalContent = await applyEditorialStyle(
      extended,
      args.style,
      fastProvider,
      outline.wordCountTarget,
      meter,
      countWords(extended) > countWords(draft) ? countWords(draft) : 0,
      notes.text,
    );
    console.log(cost());

    log(args, "factcheck", "Matching claims to source URLs");
    const hits = citableHits(research.hits);
    const checker = resolveChecker(fastProvider.modelId, args.checkModel);
    const checked = await checkClaims(
      finalContent,
      hits,
      checker,
      notes.text,
      meter,
    );
    console.log(cost());
    console.log(`[factcheck] ${checked.detail}`);

    console.log(`Words: ${countWords(checked.text)}`);

    const formatted = formatOutput(args, checked.text);
    const slug = topicSlug(args.topic);
    const path = `output/${slug}.md`;
    await writeOutputFile(path, formatted);
    await writeOutputFile(
      `output/${slug}.notes.md`,
      notesRecord({
        notes: notes.text,
        outlineModel: reasoningProvider.modelId ?? reasoningProvider.name,
        draftModel: fastProvider.modelId ?? fastProvider.name,
        cost: cost(),
        factcheck: factcheckRecord(checked),
      }),
    );

    return formatted;
  } catch (error) {
    console.log(cost());
    throw error;
  }
}

if (import.meta.main) {
  const args = parseArgs();
  const output = await runWritingWorkflow(args);

  if (output) {
    console.log("");
    console.log("=== Final Output ===");
    console.log(output);
  }
}
