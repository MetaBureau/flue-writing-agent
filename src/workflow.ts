import {
  assertEssayLength,
  bodyWordCount,
  capEssayLength,
  countWords,
  draftingNotes,
  essayReadyToSave,
  extendDraft,
  finishEssay,
  generateDrafts,
  generateOutline,
  notesRecord,
  publishedTitle,
  stripLeadingTitle,
  synthesizeEssay,
} from "./agents/write.ts";
import type { EditorialStyle } from "./agents/write.ts";
import {
  briefcheckSidecar,
  briefSidecar,
  briefStageDetail,
  enforceBrief,
  parseBrief,
  researchQuery,
} from "./brief.ts";
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
  briefcheckPiece,
  draftPiece,
  essayLengthFloor,
  essayPiece,
  notesPiece,
  type StageId,
  synthesisPiece,
  type WriteEvent,
} from "./contract.ts";
import { topicSlug, writeOutputFile } from "./main.ts";
import { gatherResearch, supplementResearch } from "./research.ts";
import { applyEditorialStyle } from "./skills/editorial.ts";
import {
  DRAFT_MODELS,
  modelLabel,
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
  let stage: StageId = "brief";
  try {
    yield { type: "stage", id: "brief", status: "active" };
    const target = input.words ?? DEFAULT_ESSAY_LENGTH;
    const brief = await parseBrief(
      input.topic,
      fast,
      meter,
      catalog.get(fast.modelId)?.supportedParams,
    );
    yield {
      type: "stage",
      id: "brief",
      status: "done",
      detail: `${briefStageDetail(brief)} · ${cost()}`,
    };

    stage = "research";
    yield {
      type: "stage",
      id: "research",
      status: "active",
      detail: checker.apiKey
        ? "Searching notes"
        : "Searching notes · no HaiMaker key; not checked",
    };
    let research = await gatherResearch(researchQuery(brief), target);
    let notes = {
      text: draftingNotes(
        [input.topic, research.text].filter(Boolean).join("\n\n"),
      ),
      topic: input.topic,
      brief,
    };
    yield {
      type: "stage",
      id: "research",
      status: "done",
      detail: research.count > 0
        ? `${research.count} sources · ${research.query}`
        : `Topic only · ${research.query || "no query"}`,
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
      brief,
    };
    yield { type: "piece", piece: notesPiece(slug, `${notes.text.trim()}\n`) };
    yield {
      type: "stage",
      id: "outline",
      status: "done",
      detail: `${outline.title} · ${research.count} sources · ${cost()}`,
    };

    stage = "drafts";
    const drafters = resolveProvider("haimaker", "fast").apiKey
      ? DRAFT_MODELS.map((id) => resolveProvider("haimaker", "fast", id))
      : [fast];
    yield {
      type: "stage",
      id: "drafts",
      status: "active",
      detail: drafters.map((model) => model.modelId).join(", "),
    };
    const drafts = await generateDrafts({}, outline, drafters, notes, meter);
    for (const draft of drafts) {
      yield {
        type: "piece",
        piece: draftPiece(
          slug,
          draft.model,
          draft.content,
          modelLabel(draft.model),
        ),
      };
    }
    const draftIds = drafts.map((draft) => draft.model).join(", ");
    yield {
      type: "stage",
      id: "drafts",
      status: "done",
      detail: drafts.length < drafters.length
        ? `${drafts.length} succeeded · ${draftIds} · ${cost()}`
        : `${draftIds} · ${cost()}`,
    };

    stage = "synthesis";
    const mercury = resolveProvider("mercury", "fast", "mercury-2.5");
    yield {
      type: "stage",
      id: "synthesis",
      status: "active",
      detail: mercury.apiKey
        ? "Mercury · mercury-2.5"
        : `no Mercury key; ${fast.name} · ${fast.modelId}`,
    };
    const synthesis = await synthesizeEssay(
      outline,
      drafts,
      notes,
      mercury,
      fast,
      meter,
    );
    yield {
      type: "piece",
      piece: synthesisPiece(slug, synthesis.content),
    };
    const fallbackNote = synthesis.fallback
      ? "fell back to longest draft · "
      : "";
    yield {
      type: "stage",
      id: "synthesis",
      status: synthesis.fallback ? "warning" : "done",
      detail:
        `${fallbackNote}${synthesis.source} · ${synthesis.model} · ${
          countWords(synthesis.content)
        } words · ${cost()}`,
    };

    stage = "extend";
    yield { type: "stage", id: "extend", status: "active" };
    const draft = stripLeadingTitle(synthesis.content);
    let extended = await extendDraft(
      draft,
      notes.text,
      outline.wordCountTarget,
      fast,
      "extend",
      meter,
      brief,
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
        brief,
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
        brief,
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
      brief,
      meter,
      essayLengthFloor(outline.wordCountTarget),
      notes.text,
    );
    let content = capEssayLength(
      finishEssay(
        outline.title,
        styled,
        essayLengthFloor(outline.wordCountTarget),
      ),
      outline.wordCountTarget,
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

    stage = "briefcheck";
    yield { type: "stage", id: "briefcheck", status: "active" };
    const briefCheck = await enforceBrief({
      essay: content,
      brief,
      notes: notes.text,
      checker,
      mercury,
      writer: fast,
      floorWords: essayLengthFloor(outline.wordCountTarget),
      wordCountTarget: outline.wordCountTarget,
      meter,
      supportedParams: catalog.get(checker.modelId)?.supportedParams,
    });
    content = briefCheck.text;
    assertEssayLength(content, outline.wordCountTarget);
    if (briefCheck.revised) {
      yield { type: "piece", piece: briefcheckPiece(slug, content) };
    }
    yield {
      type: "stage",
      id: "briefcheck",
      status: briefCheck.skipped || (!briefCheck.pass && !briefCheck.revised)
        ? "warning"
        : "done",
      detail: `${briefCheck.detail} · ${cost()}`,
    };

    stage = "factcheck";
    yield { type: "stage", id: "factcheck", status: "active" };
    const hits = citableHits(research.hits);
    const save = async (checked: Awaited<ReturnType<typeof checkClaims>>) => {
      const markdown = essayReadyToSave(
        publishedTitle(input.topic, outline.title, checked.text),
        checked.text,
        outline.wordCountTarget,
      );
      const notesMarkdown = notesRecord({
        notes: notes.text,
        outlineModel: reasoning.modelId ?? reasoning.name,
        draftModels: drafts.map((item) => item.model),
        synthesisModel: synthesis.model,
        cost: cost(),
        brief: briefSidecar(brief),
        briefcheck: briefcheckSidecar(briefCheck),
        factcheck: factcheckRecord(checked),
      });
      await writeOutputFile(`output/${slug}.md`, markdown);
      await writeOutputFile(`output/${slug}.notes.md`, notesMarkdown);
      return {
        markdown,
        notesMarkdown,
        words: bodyWordCount(markdown),
      };
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
      yield {
        type: "piece",
        piece: essayPiece(slug, saved.markdown, saved.words),
      };
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
    const saved = await save(checked);
    const note = checker.note ? ` · ${checker.note}` : "";
    yield {
      type: "stage",
      id: "factcheck",
      status: "done",
      detail: `${checked.detail} · ${checker.modelId}${note} · ${cost()}`,
    };
    yield {
      type: "piece",
      piece: essayPiece(slug, saved.markdown, saved.words),
    };
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
