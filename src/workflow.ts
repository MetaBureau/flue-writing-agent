import {
  bodyWordCount,
  draftEssay,
  essayMarkdown,
  essayReadyToSave,
  extractSourceNotes,
  fitLength,
  formatPlan,
  notesRecord,
  planEssay,
  publishedTitle,
  stripLeadingTitle,
  type EssayPlan,
} from "./agents/write.ts";
import type { EditorialStyle } from "./agents/write.ts";
import {
  applyBriefDefaults,
  briefSidecar,
  briefStageDetail,
  counterQuery,
  parseBrief,
  researchQuery,
  type Brief,
} from "./brief.ts";
import { loadModelHub, pricesFromCatalog } from "./catalog.ts";
import {
  copyProblems,
  groundingProblems,
  layer1Problems,
  quoteCopiedPhrases,
  withSources,
} from "./cite.ts";
import { formatRun, RunMeter } from "./complete.ts";
import {
  DEFAULT_ESSAY_LENGTH,
  criticPiece,
  draftPiece,
  essayPiece,
  notesPiece,
  planPiece,
  type StageId,
  type WriteEvent,
} from "./contract.ts";
import {
  criticSidecar,
  issuesFromHarness,
  mergeIssues,
  reviewEssay,
  revisePassages,
  type CriticReview,
  type RubricItem,
} from "./critic.ts";
import { topicSlug, writeOutputFile } from "./output.ts";
import {
  canonicalUrl,
  formatAttributedNotes,
  gatherResearch,
  mergeNotes,
  noteFloor,
  supplementResearch,
  type Article,
  type ResearchNotes,
  type SourceNote,
} from "./research.ts";
import {
  isStyleName,
  styles,
} from "./skills/styles.ts";
import {
  PROVIDERS,
  reloadEnv,
  resolveProvider,
} from "./providers.ts";

export interface WriteJobInput {
  topic: string;
  style: EditorialStyle;
  provider?: string;
  model?: string;
  checkModel?: string;
  words?: number;
  outDir?: string;
  keepOnFail?: boolean;
}

export interface WriteJobResult {
  slug: string;
  markdown: string;
  notesMarkdown: string;
  notes: SourceNote[];
  articles: Article[];
  brief: Brief;
  plan: EssayPlan;
  review: CriticReview;
  leftover: string[];
  layer1: string[];
  cost: string;
  target: number;
}

function emptyRubric(): RubricItem[] {
  return [
    "claim",
    "advance",
    "objection",
    "fidelity",
    "voice",
    "audience",
    "takeaway",
    "silence",
  ].map((id) => ({
    id: id as RubricItem["id"],
    pass: true,
    passage: "",
    fix: "",
  }));
}

async function fillNotes(
  articles: readonly Article[],
  existing: readonly SourceNote[],
  writer: ReturnType<typeof resolveProvider>,
  brief: Brief,
  meter: RunMeter,
  writerParams: readonly string[] | undefined,
): Promise<SourceNote[]> {
  const known = new Set(existing.map((note) => canonicalUrl(note.url)));
  const fresh = articles.filter((article) =>
    !known.has(canonicalUrl(article.url))
  );
  if (fresh.length === 0) return [...existing];
  const extra = await extractSourceNotes(
    fresh,
    writer,
    brief,
    meter,
    writerParams,
  );
  return mergeNotes(existing, extra);
}

export async function* writeStages(
  input: WriteJobInput,
): AsyncGenerator<WriteEvent, WriteJobResult | undefined> {
  await reloadEnv();
  const providerName = input.provider && input.provider in PROVIDERS
    ? input.provider
    : "mercury";
  const writer = resolveProvider(providerName, "reasoning", input.model);
  const criticModel = input.checkModel
    ? resolveProvider("haimaker", "fast", input.checkModel)
    : writer;
  const catalog = await loadModelHub().catch(() => new Map());
  const prices = pricesFromCatalog(catalog);
  const meter = new RunMeter();
  const cost = () => formatRun(meter, prices);
  const writerParams = catalog.get(writer.modelId)?.supportedParams;
  if (!writer.apiKey) {
    const problem = `${writer.name} key is not set.`;
    yield { type: "stage", id: "brief", status: "error", detail: problem };
    yield { type: "error", stage: "brief", error: problem };
    return;
  }

  const slug = topicSlug(input.topic);
  const outDir = input.outDir ?? "output";
  const style = isStyleName(input.style) ? styles[input.style] : styles.professional;
  let stage: StageId = "brief";
  try {
    yield { type: "stage", id: "brief", status: "active" };
    const target = input.words ?? DEFAULT_ESSAY_LENGTH;
    let brief = applyBriefDefaults(
      await parseBrief(input.topic, writer, meter, writerParams),
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
      detail: "Search, extract, and note the sources",
    };
    let research: ResearchNotes = await gatherResearch(
      researchQuery(brief),
      target,
      counterQuery(brief),
    );
    let notes = await extractSourceNotes(
      research.articles,
      writer,
      brief,
      meter,
      writerParams,
    );
    const floor = noteFloor(target);
    if (notes.length < floor) {
      research = await supplementResearch(
        research,
        [researchQuery(brief), counterQuery(brief)],
        target,
      );
      notes = await fillNotes(
        research.articles,
        notes,
        writer,
        brief,
        meter,
        writerParams,
      );
    }
    let notesText = formatAttributedNotes(notes);
    yield {
      type: "stage",
      id: "research",
      status: "done",
      detail: research.count > 0
        ? `${research.count} articles · ${research.query}`
        : `Topic only · ${research.query || "no query"}`,
    };
    yield {
      type: "piece",
      piece: notesPiece(slug, `${notesText || "No sourced notes."}\n`),
    };

    stage = "plan";
    yield {
      type: "stage",
      id: "plan",
      status: "active",
      detail: `${writer.name} · ${writer.modelId}`,
    };
    let plan = await planEssay(
      brief,
      notes,
      target,
      writer,
      meter,
      writerParams,
    );
    if (!brief.claim && plan.claim) {
      brief = applyBriefDefaults(brief, plan.claim);
    }
    plan = { ...plan, claim: brief.claim || plan.claim };
    if (notes.length < floor && plan.gaps.length > 0) {
      research = await supplementResearch(research, plan.gaps, target);
      notes = await fillNotes(
        research.articles,
        notes,
        writer,
        brief,
        meter,
        writerParams,
      );
      notesText = formatAttributedNotes(notes);
      plan = await planEssay(
        brief,
        notes,
        target,
        writer,
        meter,
        writerParams,
      );
      if (!brief.claim && plan.claim) {
        brief = applyBriefDefaults(brief, plan.claim);
      }
      plan = { ...plan, claim: brief.claim || plan.claim };
    }
    yield { type: "piece", piece: planPiece(slug, formatPlan(plan)) };
    yield {
      type: "stage",
      id: "plan",
      status: "done",
      detail: `${plan.title} · ${plan.sections.length} sections · ${cost()}`,
    };

    stage = "draft";
    yield {
      type: "stage",
      id: "draft",
      status: "active",
      detail: writer.modelId,
    };
    let essay = stripLeadingTitle(
      await draftEssay(
        brief,
        notes,
        plan,
        writer,
        style,
        meter,
        writerParams,
      ),
    );
    essay = await fitLength(
      essay,
      brief,
      notes,
      plan,
      writer,
      meter,
      writerParams,
    );
    yield { type: "piece", piece: draftPiece(slug, essay) };
    yield {
      type: "stage",
      id: "draft",
      status: "done",
      detail: `${bodyWordCount(essay)} / ${plan.wordCountTarget} words · ${cost()}`,
    };

    stage = "critic";
    yield { type: "stage", id: "critic", status: "active" };
    const criticParams = catalog.get(criticModel.modelId)?.supportedParams;
    const emptyReview = (): CriticReview => ({
      issues: [],
      rubric: emptyRubric(),
    });
    let review = emptyReview();
    const harness = groundingProblems(
      essay,
      notes,
      research.articles,
      brief.text,
    );
    if (criticModel.apiKey) {
      review = await reviewEssay({
        brief,
        notes,
        essay,
        model: criticModel,
        meter,
        supportedParams: criticParams,
        harness,
      });
    }
    const issues = mergeIssues(review.issues, issuesFromHarness(harness));
    const revised = issues.length > 0;
    if (revised) {
      essay = stripLeadingTitle(
        await revisePassages({
          brief,
          notes,
          essay,
          issues,
          model: writer,
          meter,
          supportedParams: writerParams,
        }),
      );
    }
    let leftover = groundingProblems(
      essay,
      notes,
      research.articles,
      brief.text,
    );
    if (leftover.length > 0) {
      essay = stripLeadingTitle(
        await revisePassages({
          brief,
          notes,
          essay,
          issues: issuesFromHarness(leftover),
          model: writer,
          meter,
          supportedParams: writerParams,
        }),
      );
      leftover = groundingProblems(
        essay,
        notes,
        research.articles,
        brief.text,
      );
    }
    if (copyProblems(essay, research.articles).length > 0) {
      essay = quoteCopiedPhrases(essay, research.articles);
      leftover = groundingProblems(
        essay,
        notes,
        research.articles,
        brief.text,
      );
    }
    essay = await fitLength(
      essay,
      brief,
      notes,
      plan,
      writer,
      meter,
      writerParams,
    );
    leftover = groundingProblems(
      essay,
      notes,
      research.articles,
      brief.text,
    );
    if (criticModel.apiKey && (revised || leftover.length > 0)) {
      review = await reviewEssay({
        brief,
        notes,
        essay,
        model: criticModel,
        meter,
        supportedParams: criticParams,
        harness: leftover,
      });
    }
    leftover = groundingProblems(
      essay,
      notes,
      research.articles,
      brief.text,
    );
    yield {
      type: "piece",
      piece: criticPiece(
        slug,
        `${criticSidecar(review, leftover)}\n`,
      ),
    };
    yield {
      type: "stage",
      id: "critic",
      status: leftover.length > 0 || !criticModel.apiKey ||
          review.issues.length > 0
        ? "warning"
        : "done",
      detail: leftover.length > 0
        ? `${leftover.length} harness warnings · ${cost()}`
        : !criticModel.apiKey
        ? `harness only · ${cost()}`
        : review.issues.length > 0
        ? `${review.issues.length} remaining · ${criticModel.modelId} · ${cost()}`
        : `pass · ${criticModel.modelId} · ${cost()}`,
    };
    essay = withSources(essay, notes);
    const title = publishedTitle(input.topic, plan.title, essay);
    let markdown: string;
    try {
      markdown = essayReadyToSave(title, essay, plan.wordCountTarget);
    } catch (error) {
      if (!input.keepOnFail) throw error;
      markdown = essayMarkdown(title, essay);
    }
    const layer1 = layer1Problems(
      markdown,
      notes,
      research.articles,
      plan.wordCountTarget,
      brief.text,
    );
    const notesMarkdown = notesRecord({
      notes: notesText || "No sourced notes.",
      writerModel: writer.modelId ?? writer.name,
      cost: cost(),
      brief: briefSidecar(brief),
      plan: formatPlan(plan),
      critic: criticSidecar(review, leftover),
    });
    const result: WriteJobResult = {
      slug,
      markdown,
      notesMarkdown,
      notes,
      articles: research.articles,
      brief,
      plan,
      review,
      leftover,
      layer1,
      cost: cost(),
      target: plan.wordCountTarget,
    };
    if (layer1.length > 0 && !input.keepOnFail) {
      yield {
        type: "stage",
        id: "critic",
        status: "error",
        detail: `${layer1.join("; ")} · ${cost()}`,
      };
      yield {
        type: "error",
        stage: "critic",
        error: `${layer1.join("; ")} · ${cost()}`,
      };
      return result;
    }
    await writeOutputFile(`${outDir}/${slug}.md`, markdown);
    await writeOutputFile(`${outDir}/${slug}.notes.md`, notesMarkdown);
    yield {
      type: "piece",
      piece: essayPiece(slug, markdown, bodyWordCount(markdown)),
    };
    yield { type: "piece", piece: notesPiece(slug, notesMarkdown) };
    yield { type: "essay", markdown, filename: `${slug}.md` };
    return result;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The writer failed.";
    const detail = `${message} · ${cost()}`;
    yield { type: "stage", id: stage, status: "error", detail };
    yield { type: "error", stage, error: detail };
    return;
  }
}
