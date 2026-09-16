/// <reference lib="deno.ns" />
import { generateOutline, generateDrafts, selectBestDraft } from "./agents/write.ts";
import { webResearch } from "./tools/web.ts";
import { applyEditorialStyle } from "./skills/editorial.ts";
import { PROVIDERS, ProviderConfig, resolveProvider } from "./providers.ts";

// Enhanced CLI argument parser
interface Args {
  topic: string;
  provider?: string;
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
    console.log("  --style <name>      Style: economist, strunk-white, monocle, professional");
    console.log("  --format <fmt>      Output: markdown, json, plain");
    console.log("  --verbose           Show detailed progress");
    console.log("  --dry-run           Show config without running");
    console.log("");
    console.log("Provider configuration via environment variables:");
    for (const [name, cfg] of Object.entries(PROVIDERS)) {
      console.log(`  ${name.toUpperCase()}_PROVIDER=${name}`);
      console.log(`  ${name.toUpperCase()}_MODEL_ID=${cfg.defaultModelId}`);
      console.log(`  ${name.toUpperCase()}_API_KEY=...`);
      console.log("");
    }
    Deno.exit(1);
  }

  return { ...args, topic } as Args;
}

async function log(args: Args, phase: string, detail: string) {
  if (args.verbose) {
    console.log(`[PHASE] ${phase}: ${detail}`);
  }
}

function formatOutput(args: Args, content: string) {
  if (args.outputFormat === "json") {
    return JSON.stringify({
      topic: args.topic,
      style: args.style,
      content,
      generatedAt: new Date().toISOString(),
    }, null, 2);
  } else if (args.outputFormat === "markdown") {
    return `# ${args.topic}\n\n## Style: ${args.style}\n\n---\n\n${content}`;
  } else {
    return content;
  }
}

async function runWritingWorkflow(args: Args) {
  // Resolve provider configuration
  const providerName = args.provider || 
    (Deno.env.get("FAST_PROVIDER") as keyof typeof PROVIDERS) || 
    "mercury";

  const fastProvider = resolveProvider(providerName, "fast");
  const reasoningProvider = resolveProvider(providerName, "reasoning");

  if (args.dryRun) {
    console.log("=== Configuration (dry run) ===");
    console.log(`Topic: ${args.topic}`);
    console.log(`Provider: ${providerName}`);
    console.log(`Style: ${args.style}`);
    console.log(`Fast Model: ${fastProvider.modelId} (${fastProvider.baseUrl})`);
    console.log(`Reasoning Model: ${reasoningProvider.modelId} (${reasoningProvider.baseUrl})`);
    console.log(`Output Format: ${args.outputFormat}`);
    console.log(`Verbose: ${args.verbose}`);
    return;
  }

  // Research phase
  await log(args, "research", `Fetching sources for "${args.topic}"`);
  const research = await webResearch(args.topic);

  // Outline phase
  await log(args, "outline", `Generating structure with ${reasoningProvider.name}`);
  const outline = await generateOutline({}, args.topic, research, reasoningProvider);

  // Draft generation phase
  await log(args, "drafts", `Creating variations with ${fastProvider.name}`);
  const drafts = await generateDrafts({}, outline, fastProvider);

  // Selection phase
  await log(args, "selection", "Choosing best draft");
  const selected = await selectBestDraft({}, drafts, args.style);

  // Editorial styling phase
  await log(args, "style", `Applying ${args.style} editorial rules`);
  const finalContent = await applyEditorialStyle(selected.content, args.style, fastProvider);

  // Format and return
  return formatOutput(args, finalContent);
}

// Entry point
const args = parseArgs();
const output = await runWritingWorkflow(args);

if (output) {
  console.log("");
  console.log("=== Final Output ===");
  console.log(output);
}
