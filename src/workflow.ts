import {
  extendDraft,
  generateDrafts,
  generateOutline,
  pickDraft,
} from "./agents/write.ts";
import type { EditorialStyle } from "./agents/write.ts";
import { type StageId, type WriteEvent } from "./contract.ts";
import { topicSlug } from "./main.ts";
import { gatherResearch } from "./research.ts";
import { applyEditorialStyle } from "./skills/editorial.ts";
import {
  providerKeyProblem,
  PROVIDERS,
  reloadEnv,
  resolveProvider,
} from "./providers.ts";

export async function* writeStages(input: {
  topic: string;
  style: EditorialStyle;
  provider?: string;
  model?: string;
}): AsyncGenerator<WriteEvent, void> {
  await reloadEnv();
  const providerName = input.provider && input.provider in PROVIDERS
    ? input.provider
    : "mercury";
  const fast = resolveProvider(providerName, "fast", input.model);
  const reasoning = resolveProvider(providerName, "reasoning", input.model);
  const keyProblem = providerKeyProblem(providerName);
  if (keyProblem) {
    yield { type: "stage", id: "outline", status: "error", detail: keyProblem };
    yield { type: "error", stage: "outline", error: keyProblem };
    return;
  }

  let stage: StageId = "research";
  try {
    yield {
      type: "stage",
      id: "research",
      status: "active",
      detail: "Searching notes",
    };
    const research = await gatherResearch(input.topic);
    const notes = {
      text: [input.topic, research.text].filter(Boolean).join("\n\n"),
      topic: input.topic,
    };
    yield {
      type: "stage",
      id: "research",
      status: "done",
      detail: research.count > 0 ? `${research.count} sources` : "Topic only",
    };

    stage = "outline";
    yield {
      type: "stage",
      id: "outline",
      status: "active",
      detail: `${reasoning.name} · ${reasoning.modelId}`,
    };
    const outline = await generateOutline({}, notes, reasoning);
    yield {
      type: "stage",
      id: "outline",
      status: "done",
      detail: outline.title,
    };

    stage = "drafts";
    yield {
      type: "stage",
      id: "drafts",
      status: "active",
      detail: `${fast.name} · ${fast.modelId}`,
    };
    const drafts = await generateDrafts({}, outline, fast, notes);
    const selected = pickDraft(drafts, input.style);
    yield {
      type: "stage",
      id: "drafts",
      status: "done",
      detail: selected.style,
    };

    stage = "style";
    yield { type: "stage", id: "style", status: "active", detail: input.style };
    const styled = await applyEditorialStyle(
      selected.content,
      input.style,
      fast,
      outline.wordCountTarget,
    );
    yield { type: "stage", id: "style", status: "done" };

    stage = "extend";
    yield { type: "stage", id: "extend", status: "active" };
    const content = await extendDraft(
      styled,
      notes.text,
      outline.wordCountTarget,
      fast,
      `style:${input.style}`,
    );
    yield { type: "stage", id: "extend", status: "done" };

    const markdown =
      `# ${outline.title}\n\n## Style: ${input.style}\n\n---\n\n${content}`;
    const path = `output/${topicSlug(outline.title || input.topic)}.md`;
    await Deno.mkdir("output", { recursive: true });
    const tempPath = `${path}.tmp`;
    await Deno.writeTextFile(tempPath, markdown);
    await Deno.rename(tempPath, path);
    yield { type: "essay", markdown };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The writer failed.";
    yield { type: "stage", id: stage, status: "error", detail: message };
    yield { type: "error", stage, error: message };
  }
}
