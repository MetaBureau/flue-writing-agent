/// <reference lib="deno.ns" />
import {
  bodyWordCount,
  cleanEssayBody,
  essayMarkdown,
  stripLeadingTitle,
  wordCountFromTopic,
} from "./agents/write.ts";
import { isProviderModel, PROVIDERS, resolveProvider } from "./providers.ts";
import { writeStages } from "./workflow.ts";

export { countWords } from "./agents/write.ts";
export { topicSlug, writeOutputFile } from "./output.ts";

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
      "  --check-model <id>  Optional critic model (default is the writer)",
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

function formatOutput(args: Args, content: string, title = args.topic) {
  const body = stripLeadingTitle(content);
  if (args.outputFormat === "json") {
    return JSON.stringify(
      {
        topic: args.topic,
        style: args.style,
        content: body,
        wordCount: bodyWordCount(body),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  } else if (args.outputFormat === "markdown") {
    return essayMarkdown(title, cleanEssayBody(body));
  } else {
    return cleanEssayBody(body);
  }
}

async function runWritingWorkflow(args: Args) {
  const providerName = args.provider ||
    (Deno.env.get("FAST_PROVIDER") as keyof typeof PROVIDERS) ||
    "mercury";

  if (args.checkModel && !isProviderModel("haimaker", args.checkModel)) {
    throw new Error("Unknown checker model.");
  }
  const writer = resolveProvider(providerName, "reasoning", args.model);

  if (args.dryRun) {
    console.log("=== Configuration (dry run) ===");
    console.log(`Topic: ${args.topic}`);
    console.log(`Provider: ${providerName}`);
    console.log(`Style: ${args.style}`);
    console.log(`Writer: ${writer.modelId} (${writer.baseUrl})`);
    console.log(
      `Critic: ${args.checkModel ?? writer.modelId}`,
    );
    console.log(`Output Format: ${args.outputFormat}`);
    console.log(`Verbose: ${args.verbose}`);
    console.log(
      `Research: ${Deno.env.get("TAVILY_API_KEY") ? "api key" : "keyless"}`,
    );
    return;
  }

  log(args, "write", `Running with ${writer.modelId}`);
  let markdown = "";
  for await (
    const event of writeStages({
      topic: args.topic,
      style: args.style,
      provider: providerName,
      model: args.model,
      checkModel: args.checkModel,
      words: wordCountFromTopic(args.topic),
    })
  ) {
    if (event.type === "stage") {
      const detail = event.detail ? ` ${event.detail}` : "";
      console.log(`[${event.id}] ${event.status}${detail}`);
    }
    if (event.type === "essay") markdown = event.markdown;
    if (event.type === "error") throw new Error(event.error);
  }
  if (!markdown) throw new Error("The writer returned no essay.");
  if (args.outputFormat === "markdown") return markdown;
  return formatOutput(args, markdown);
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
