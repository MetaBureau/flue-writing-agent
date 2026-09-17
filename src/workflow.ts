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
import type { EditorialStyle } from "./agents/write.ts";
import { loadModelHub, pricesFromCatalog } from "./catalog.ts";
import {
  checkClaims,
  citableHits,
  factcheckRecord,
  resolveChecker,
  uncheckedResult,
} from "./factcheck.ts";
import { formatRun, RunMeter } from "./complete.ts";
import { type StageId, type WriteEvent } from "./contract.ts";
import { topicSlug, writeOutputFile } from "./main.ts";
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
  checkModel?: string;
}): AsyncGenerator<WriteEvent, void> {
  await reloadEnv();
  const providerName = input.provider && input.provider in PROVIDERS
    ? input.provider
    : "mercury";
  const fast = resolveProvider(providerName, "fast", input.model);
  const reasoning = resolveProvider(providerName, "reasoning", input.model);
  const keyProblem = providerKeyProblem(providerName);
  const checker = resolveChecker(fast.modelId, input.checkModel);
  const catalog = await loadModelHub().catch(() => new Map());
  const prices = pricesFromCatalog(catalog);
  const meter = new RunMeter();
  const cost = () => formatRun(meter, prices);
  if (keyProblem) {
    yield { type: "stage", id: "outline", status: "error", detail: keyProblem };
    yield { type: "error", stage: "outline", error: keyProblem };
    return;
  }
  if (!checker.apiKey) console.log("no HaiMaker key; not checked");

  let stage: StageId = "research";
  try {
    yield {
      type: "stage",
      id: "research",
      status: "active",
      detail: checker.apiKey
        ? "Searching notes"
        : "Searching notes · no HaiMaker key; not checked",
    };
    const research = await gatherResearch(input.topic);
    const notes = {
      text: draftingNotes(
        [input.topic, research.text].filter(Boolean).join("\n\n"),
      ),
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
    const outline = await generateOutline(
      {},
      notes,
      reasoning,
      meter,
      catalog.get(reasoning.modelId)?.supportedParams,
    );
    yield {
      type: "stage",
      id: "outline",
      status: "done",
      detail: `${outline.title} · ${cost()}`,
    };

    stage = "drafts";
    yield {
      type: "stage",
      id: "drafts",
      status: "active",
      detail: `${fast.name} · ${fast.modelId}`,
    };
    const drafts = await generateDrafts({}, outline, fast, notes, meter);
    const selected = pickDraft(drafts, input.style);
    yield {
      type: "stage",
      id: "drafts",
      status: "done",
      detail: `${selected.style} · ${cost()}`,
    };

    stage = "extend";
    yield { type: "stage", id: "extend", status: "active" };
    const draft = stripLeadingTitle(selected.content);
    const extended = await extendDraft(
      draft,
      notes.text,
      outline.wordCountTarget,
      fast,
      "extend",
      meter,
    );
    yield { type: "stage", id: "extend", status: "done", detail: cost() };

    stage = "style";
    yield { type: "stage", id: "style", status: "active", detail: input.style };
    const content = await applyEditorialStyle(
      extended,
      input.style,
      fast,
      outline.wordCountTarget,
      meter,
      countWords(extended) > countWords(draft) ? countWords(draft) : 0,
      notes.text,
    );
    yield { type: "stage", id: "style", status: "done", detail: cost() };

    stage = "factcheck";
    yield { type: "stage", id: "factcheck", status: "active" };
    const hits = citableHits(research.hits);
    const slug = topicSlug(outline.title || input.topic);
    const save = async (checked: Awaited<ReturnType<typeof checkClaims>>) => {
      const markdown = essayMarkdown(outline.title, checked.text);
      await writeOutputFile(`output/${slug}.md`, markdown);
      await writeOutputFile(
        `output/${slug}.notes.md`,
        notesRecord({
          notes: notes.text,
          outlineModel: reasoning.modelId ?? reasoning.name,
          draftModel: fast.modelId ?? fast.name,
          cost: cost(),
          factcheck: factcheckRecord(checked),
        }),
      );
      return markdown;
    };
    let checked: Awaited<ReturnType<typeof checkClaims>>;
    try {
      checked = await checkClaims(
        content,
        hits,
        checker,
        notes.text,
        meter,
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "fact-check failed";
      const markdown = await save(
        uncheckedResult(content, message, checker.modelId),
      );
      const detail = `${message} · saved unchecked · ${checker.modelId} · ${cost()}`;
      yield { type: "essay", markdown };
      yield { type: "stage", id: "factcheck", status: "error", detail };
      yield { type: "error", stage: "factcheck", error: detail };
      return;
    }
    const markdown = await save(checked);
    const note = checker.note ? ` · ${checker.note}` : "";
    yield {
      type: "stage",
      id: "factcheck",
      status: "done",
      detail: `${checked.detail} · ${checker.modelId}${note} · ${cost()}`,
    };
    yield { type: "essay", markdown };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The writer failed.";
    const detail = `${message} · ${cost()}`;
    yield { type: "stage", id: stage, status: "error", detail };
    yield { type: "error", stage, error: detail };
  }
}
