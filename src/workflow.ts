import {
  bodyWordCount,
  draftEssay,
  essayReadyToSave,
  extractSourceNotes,
  fitLength,
  formatPlan,
  notesRecord,
  planEssay,
  publishedTitle,
  stripLeadingTitle,
} from "./agents/write.ts";
import type { EditorialStyle } from "./agents/write.ts";
import {
  briefSidecar,
  briefStageDetail,
  counterQuery,
  parseBrief,
  researchQuery,
} from "./brief.ts";
import { loadModelHub, pricesFromCatalog } from "./catalog.ts";
import {
  copyProblems,
  groundingProblems,
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
} from "./critic.ts";
import { topicSlug, writeOutputFile } from "./output.ts";
import { formatAttributedNotes, gatherResearch } from "./research.ts";
import {
  isStyleName,
  styles,
} from "./skills/styles.ts";
import {
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
  const style = isStyleName(input.style) ? styles[input.style] : styles.professional;
  let stage: StageId = "brief";
  try {
    yield { type: "stage", id: "brief", status: "active" };
    const target = input.words ?? DEFAULT_ESSAY_LENGTH;
    const brief = await parseBrief(
      input.topic,
      writer,
      meter,
      writerParams,
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
    const research = await gatherResearch(
      researchQuery(brief),
      target,
      counterQuery(brief),
    );
    const notes = await extractSourceNotes(
      research.articles,
      writer,
      brief,
      meter,
      writerParams,
    );
    const notesText = formatAttributedNotes(notes);
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
    const plan = await planEssay(
      brief,
      notes,
      target,
      writer,
      meter,
      writerParams,
    );
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
    const harness = groundingProblems(essay, notes, research.articles);
    let review = {
      issues: [] as Awaited<ReturnType<typeof reviewEssay>>["issues"],
    };
    if (criticModel.apiKey) {
      review = await reviewEssay({
        brief,
        notes,
        essay,
        model: criticModel,
        meter,
        supportedParams: catalog.get(criticModel.modelId)?.supportedParams,
        harness,
      });
    }
    const issues = mergeIssues(review.issues, issuesFromHarness(harness));
    if (issues.length > 0) {
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
    let leftover = groundingProblems(essay, notes, research.articles);
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
      leftover = groundingProblems(essay, notes, research.articles);
    }
    if (copyProblems(essay, research.articles).length > 0) {
      essay = quoteCopiedPhrases(essay, research.articles);
      leftover = groundingProblems(essay, notes, research.articles);
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
    yield {
      type: "piece",
      piece: criticPiece(
        slug,
        `${criticSidecar(review, [...harness, ...leftover])}\n`,
      ),
    };
    yield {
      type: "stage",
      id: "critic",
      status: leftover.length > 0 || !criticModel.apiKey || issues.length > 0
        ? "warning"
        : "done",
      detail: leftover.length > 0
        ? `${leftover.length} harness warnings · ${cost()}`
        : !criticModel.apiKey
        ? `harness only · ${cost()}`
        : issues.length > 0
        ? `${issues.length} fixes · ${criticModel.modelId} · ${cost()}`
        : `pass · ${criticModel.modelId} · ${cost()}`,
    };
    essay = withSources(essay, notes);
    const markdown = essayReadyToSave(
      publishedTitle(input.topic, plan.title, essay),
      essay,
      plan.wordCountTarget,
    );
    const notesMarkdown = notesRecord({
      notes: notesText || "No sourced notes.",
      writerModel: writer.modelId ?? writer.name,
      cost: cost(),
      brief: briefSidecar(brief),
      plan: formatPlan(plan),
      critic: criticSidecar(review, leftover),
    });
    await writeOutputFile(`output/${slug}.md`, markdown);
    await writeOutputFile(`output/${slug}.notes.md`, notesMarkdown);
    yield {
      type: "piece",
      piece: essayPiece(slug, markdown, bodyWordCount(markdown)),
    };
    yield { type: "piece", piece: notesPiece(slug, notesMarkdown) };
    yield { type: "essay", markdown, filename: `${slug}.md` };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "The writer failed.";
    const detail = `${message} · ${cost()}`;
    yield { type: "stage", id: stage, status: "error", detail };
    yield { type: "error", stage, error: detail };
  }
}
