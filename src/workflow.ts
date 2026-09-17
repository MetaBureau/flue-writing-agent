import {
  assertEssayLength,
  countWords,
  draftingNotes,
  essayMarkdown,
  extendDraft,
  finishEssay,
  generateDrafts,
  generateOutline,
  notesRecord,
  pickDraft,
  publishedTitle,
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
import {
  DEFAULT_ESSAY_LENGTH,
  draftPiece,
  essayLengthFloor,
  essayPiece,
  notesPiece,
  type StageId,
  type WriteEvent,
} from "./contract.ts";
import { topicSlug, writeOutputFile } from "./main.ts";
import { gatherResearch, supplementResearch } from "./research.ts";
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
  words?: number;
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

  const slug = topicSlug(input.topic);
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
    const target = input.words ?? DEFAULT_ESSAY_LENGTH;
    let research = await gatherResearch(input.topic, target);
    let notes = {
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
    yield { type: "piece", piece: notesPiece(slug, `${notes.text.trim()}\n`) };

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
      target,
    );
    research = await supplementResearch(
      research,
      outline.sections,
      outline.wordCountTarget,
    );
    notes = {
      text: draftingNotes(
        [input.topic, research.text].filter(Boolean).join("\n\n"),
      ),
      topic: input.topic,
    };
    yield { type: "piece", piece: notesPiece(slug, `${notes.text.trim()}\n`) };
    yield {
      type: "stage",
      id: "outline",
      status: "done",
      detail: `${outline.title} · ${research.count} sources · ${cost()}`,
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
    for (const draft of drafts) {
      yield {
        type: "piece",
        piece: draftPiece(
          slug,
          draft.style,
          draft.content,
          draft.style === selected.style,
        ),
      };
    }
    yield {
      type: "stage",
      id: "drafts",
      status: "done",
      detail: `${selected.style} · ${cost()}`,
    };

    stage = "extend";
    yield { type: "stage", id: "extend", status: "active" };
    const draft = stripLeadingTitle(selected.content);
    let extended = await extendDraft(
      draft,
      notes.text,
      outline.wordCountTarget,
      fast,
      "extend",
      meter,
      input.topic,
    );
    if (countWords(extended) < essayLengthFloor(outline.wordCountTarget)) {
      research = await supplementResearch(
        research,
        outline.sections,
        outline.wordCountTarget,
      );
      notes = {
        text: draftingNotes(
          [input.topic, research.text].filter(Boolean).join("\n\n"),
        ),
        topic: input.topic,
      };
      yield {
        type: "piece",
        piece: notesPiece(slug, `${notes.text.trim()}\n`),
      };
      extended = await extendDraft(
        extended,
        notes.text,
        outline.wordCountTarget,
        fast,
        "extend",
        meter,
        input.topic,
      );
    }
    assertEssayLength(extended, outline.wordCountTarget);
    yield {
      type: "stage",
      id: "extend",
      status: "done",
      detail: `${
        countWords(extended)
      } / ${outline.wordCountTarget} words · ${cost()}`,
    };

    stage = "style";
    yield { type: "stage", id: "style", status: "active", detail: input.style };
    const styled = await applyEditorialStyle(
      extended,
      input.style,
      fast,
      outline.wordCountTarget,
      meter,
      essayLengthFloor(outline.wordCountTarget),
      notes.text,
      input.topic,
    );
    const content = finishEssay(
      outline.title,
      styled,
      essayLengthFloor(outline.wordCountTarget),
    );
    assertEssayLength(content, outline.wordCountTarget);
    yield {
      type: "stage",
      id: "style",
      status: "done",
      detail: `${
        countWords(content)
      } / ${outline.wordCountTarget} words · ${cost()}`,
    };

    stage = "factcheck";
    yield { type: "stage", id: "factcheck", status: "active" };
    const hits = citableHits(research.hits);
    const save = async (checked: Awaited<ReturnType<typeof checkClaims>>) => {
      const markdown = essayMarkdown(
        publishedTitle(input.topic, outline.title, checked.text),
        checked.text,
      );
      const notesMarkdown = notesRecord({
        notes: notes.text,
        outlineModel: reasoning.modelId ?? reasoning.name,
        draftModel: fast.modelId ?? fast.name,
        cost: cost(),
        factcheck: factcheckRecord(checked),
      });
      await writeOutputFile(`output/${slug}.md`, markdown);
      await writeOutputFile(`output/${slug}.notes.md`, notesMarkdown);
      return { markdown, notesMarkdown };
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
      const saved = await save(
        uncheckedResult(content, message, checker.modelId),
      );
      const detail =
        `${message} · saved unchecked · ${checker.modelId} · ${cost()}`;
      yield { type: "piece", piece: essayPiece(slug, saved.markdown) };
      yield { type: "piece", piece: notesPiece(slug, saved.notesMarkdown) };
      yield {
        type: "essay",
        markdown: saved.markdown,
        filename: `${slug}.md`,
      };
      yield { type: "stage", id: "factcheck", status: "error", detail };
      yield { type: "error", stage: "factcheck", error: detail };
      return;
    }
    assertEssayLength(checked.text, outline.wordCountTarget);
    const saved = await save(checked);
    const note = checker.note ? ` · ${checker.note}` : "";
    yield {
      type: "stage",
      id: "factcheck",
      status: "done",
      detail: `${checked.detail} · ${checker.modelId}${note} · ${cost()}`,
    };
    yield { type: "piece", piece: essayPiece(slug, saved.markdown) };
    yield { type: "piece", piece: notesPiece(slug, saved.notesMarkdown) };
    yield { type: "essay", markdown: saved.markdown, filename: `${slug}.md` };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The writer failed.";
    const detail = `${message} · ${cost()}`;
    yield { type: "stage", id: stage, status: "error", detail };
    yield { type: "error", stage, error: detail };
  }
}
