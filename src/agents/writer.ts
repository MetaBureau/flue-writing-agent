"use agent";
import { createProvider, envApiKeyAuth } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { setProvider, useInitialData, useModel, useTool } from "@flue/runtime";
import * as v from "valibot";
import {
  applyBriefDefaults,
  briefSidecar,
  counterQuery,
  fallbackBrief,
  parseBrief,
  researchQuery,
  researchRequired,
} from "../brief.ts";
import {
  dropUnknownCitations,
  groundingProblems,
  layer1Problems,
  withSources,
} from "../cite.ts";
import {
  formatRun,
  nestRunSignal,
  RunMeter,
  type TokenUsage,
} from "../complete.ts";
import {
  applyPlanBounds,
  criticSidecar,
  issuesFromHarness,
  leftoverIssues,
  leftoverSaveError,
  mergeIssues,
  planBoundProblems,
  reviewEssay,
  revisePassages,
  type CriticReview,
} from "../critic.ts";
import { DEFAULT_ESSAY_LENGTH, WRITER_MAX_ATTEMPTS, WRITER_TIMEOUT_MS } from "../contract.ts";
import {
  formatAttributedNotes,
  gatherResearch,
  mergeNotes,
  isTerminalTavilyError,
  researchFloorMessage,
  samePublication,
  shouldRequeryResearch,
  supplementResearch,
  type Article,
  type SourceNote,
} from "../notes.ts";
import { loadPrices } from "../catalog.ts";
import {
  essayStem,
  readOutputFile,
  topicSlug,
  unusedEssayPath,
  writeOutputFile,
} from "../output.ts";
import {
  reloadEnv,
  resolveCheckModel,
  resolveProvider,
} from "../providers.ts";
import {
  bodyWordCount,
  draftEssay,
  essayForDisk,
  extractSourceNotes,
  fitLength,
  formatPlan,
  notesRecord,
  planEssay,
  publishedTitle,
  type EssayPlan,
  type ModelConfig,
} from "./write.ts";
import {
  STYLE_NAMES,
  styleFromData,
} from "../skills/styles.ts";

const openAI = openAICompletionsApi();

function haimakerModel(id: string, name: string) {
  return {
    id,
    name,
    api: "openai-completions" as const,
    provider: "haimaker",
    baseUrl: "https://api.haimaker.ai/v1",
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

export const writerProviders = [
  createProvider({
    id: "mercury",
    auth: { apiKey: envApiKeyAuth("Mercury key", ["FAST_MODEL_KEY"]) },
    models: [
      {
        id: "mercury-2.5",
        name: "Mercury 2.5",
        api: "openai-completions",
        provider: "mercury",
        baseUrl: "https://api.inceptionlabs.ai/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
    api: openAI,
  }),
  createProvider({
    id: "haimaker",
    auth: { apiKey: envApiKeyAuth("HaiMaker key", ["HAIMAKER_API_KEY"]) },
    models: [
      haimakerModel("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
      haimakerModel("google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite"),
    ],
    api: openAI,
  }),
];

for (const provider of writerProviders) setProvider(provider);

export type WriterData = {
  topic: string;
  style?: string;
  provider?: "haimaker" | "mercury";
  model?: string;
  checkModel?: string;
  words?: number;
  outputPath?: string;
  keepOnFail?: boolean;
} | undefined;

export type WriterJob = {
  slug: string;
  markdown: string;
  draft?: string;
  notesMarkdown: string;
  notes: SourceNote[];
  articles: Article[];
  brief: ReturnType<typeof applyBriefDefaults>;
  plan: EssayPlan;
  review: CriticReview;
  leftover: string[];
  layer1: string[];
  cost: string;
  target: number;
  critiqueCount?: number;
  researched?: boolean;
  researchError?: string;
  usage?: Record<string, TokenUsage>;
};

function jobPath(outputPath: string): string {
  return outputPath.replace(/\.md$/, ".job.json");
}

export async function readWriterJob(
  outputPath: string,
): Promise<WriterJob | undefined> {
  const raw = await readOutputFile(jobPath(outputPath));
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as WriterJob;
  } catch {
    return undefined;
  }
}

async function writeJob(outputPath: string, job: WriterJob): Promise<void> {
  await writeOutputFile(jobPath(outputPath), `${JSON.stringify(job, null, 2)}\n`);
}

function modelFor(data: WriterData): string {
  const provider = data?.provider === "mercury" ? "mercury" : "haimaker";
  if (provider === "mercury") return "mercury/mercury-2.5";
  const id = data?.model || "anthropic/claude-sonnet-5";
  return `haimaker/${id}`;
}

function writerModel(data: WriterData) {
  const provider = data?.provider === "mercury" ? "mercury" : "haimaker";
  return resolveProvider(provider, "reasoning", data?.model);
}

function criticModel(data: WriterData) {
  const writer = writerModel(data);
  return resolveProvider(
    "haimaker",
    "reasoning",
    resolveCheckModel(writer.modelId, data?.checkModel),
  );
}

function leftoverFor(job: WriterJob, essay: string): string[] {
  return [
    ...groundingProblems(
      essay,
      job.notes,
      job.articles,
      job.brief.text,
    ),
    ...planBoundProblems(job.plan, essay),
  ];
}

async function stampCost(job: WriterJob, meter: RunMeter): Promise<void> {
  job.usage = meter.snapshot();
  job.cost = formatRun(meter, await loadPrices());
}

function researchNeeded(job: WriterJob): string | undefined {
  if (researchRequired(job.brief) && !job.researched) {
    return "Call research first. This brief needs checkable evidence.";
  }
  return undefined;
}

function openCritiqueIssues(job: WriterJob) {
  const essay = job.draft ?? job.markdown;
  return mergeIssues(
    leftoverIssues(job.review.issues, essay),
    issuesFromHarness(job.leftover),
  );
}

function critiqueReply(job: WriterJob): string {
  const sidecar = criticSidecar(job.review, job.leftover);
  const issues = openCritiqueIssues(job);
  const rewritten = job.draft?.trim()
    ? `\n\nRewritten essay:\n\n${job.draft.trim()}`
    : "";
  if (issues.length === 0) return sidecar;
  if ((job.critiqueCount ?? 0) >= 2) {
    return `${sidecar}${rewritten}\n\nCall save_essay with this essay. The sidecar is the editorial assessment.`;
  }
  return `${sidecar}${rewritten}\n\nCall save_essay with this essay. save_essay will critique again if needed.`;
}

function emptyReview(): CriticReview {
  return {
    issues: [],
    rubric: [
      "claim",
      "advance",
      "objection",
      "fidelity",
      "voice",
      "audience",
      "takeaway",
      "silence",
    ].map((id) => ({
      id: id as CriticReview["rubric"][number]["id"],
      pass: true,
      passage: "",
      fix: "",
    })),
  };
}

function stubWriterJob(
  data: WriterData,
  topic: string,
  title = topic,
): WriterJob {
  const words = data?.words ?? DEFAULT_ESSAY_LENGTH;
  const slug = data?.outputPath ? essayStem(data.outputPath) : topicSlug(topic);
  return {
    slug,
    markdown: "",
    notesMarkdown: "No sourced notes.",
    notes: [],
    articles: [],
    brief: applyBriefDefaults(fallbackBrief(topic)),
    plan: {
      title,
      claim: "",
      wordCountTarget: words,
      sections: [],
      counters: [],
      gaps: [],
    },
    review: emptyReview(),
    leftover: [],
    layer1: [],
    cost: "flue run",
    target: words,
  };
}

async function resolveOutputPath(
  data: WriterData,
  topic: string,
): Promise<string> {
  if (data?.outputPath) return data.outputPath;
  return await unusedEssayPath(`output/${topicSlug(topic)}.md`);
}

async function ensureWriterJob(
  data: WriterData,
  topic: string,
): Promise<WriterJob> {
  const outputPath = await resolveOutputPath(data, topic);
  const existing = await readWriterJob(outputPath);
  if (existing) return existing;
  const job = stubWriterJob(data, topic);
  job.slug = essayStem(outputPath);
  await writeJob(outputPath, job);
  return job;
}

async function runResearch(data: WriterData): Promise<string> {
  await reloadEnv();
  const topic = data?.topic?.trim();
  if (!topic) return "No topic. Ask the user for a brief.";
  const words = data?.words ?? DEFAULT_ESSAY_LENGTH;
  const outputPath = await resolveOutputPath(data, topic);
  const writer = writerModel(data);
  const meter = new RunMeter();
  const brief = applyBriefDefaults(
    await parseBrief(topic, writer, meter),
  );
  const early = await ensureWriterJob(data, topic);
  early.brief = brief;
  await stampCost(early, meter);
  await writeJob(outputPath, early);
  let research = await gatherResearch(
    researchQuery(brief),
    words,
    counterQuery(brief),
  );
  let notes = await extractSourceNotes(
    research.articles,
    writer as ModelConfig,
    brief,
    meter,
  );
  let gaps: string[] = [];
  if (shouldRequeryResearch(notes.length, words, research.error)) {
    research = await supplementResearch(
      research,
      [researchQuery(brief), counterQuery(brief)],
      words,
    );
    const extra = research.articles.filter((article) =>
      !notes.some((note) => samePublication(note, article))
    );
    notes = mergeNotes(
      notes,
      await extractSourceNotes(extra, writer as ModelConfig, brief, meter),
    );
    if (shouldRequeryResearch(notes.length, words, research.error)) {
      const probe = await planEssay(
        brief,
        notes,
        words,
        writer as ModelConfig,
        meter,
      );
      gaps = probe.gaps;
      if (gaps.length > 0) {
        research = await supplementResearch(research, gaps, words);
        const more = research.articles.filter((article) =>
          !notes.some((note) => samePublication(note, article))
        );
        notes = mergeNotes(
          notes,
          await extractSourceNotes(more, writer as ModelConfig, brief, meter),
        );
      }
    }
  }
  const blocked = researchFloorMessage(notes.length, words);
  const notebook = [
    research.error,
    formatAttributedNotes(notes) || "No sourced notes.",
  ].filter(Boolean).join("\n\n");
  const job: WriterJob = {
    slug: essayStem(outputPath),
    markdown: "",
    notesMarkdown: notebook,
    notes,
    articles: research.articles,
    brief,
    plan: {
      title: brief.subject || topic,
      claim: brief.claim,
      wordCountTarget: words,
      sections: [],
      counters: [],
      gaps,
    },
    review: emptyReview(),
    leftover: [],
    layer1: [],
    cost: "flue run",
    target: words,
    researched: true,
    researchError: research.error,
  };
  await stampCost(job, meter);
  await writeJob(outputPath, job);
  if (!isTerminalTavilyError(research.error)) {
    let plan = await planEssay(
      brief,
      notes,
      words,
      writer as ModelConfig,
      meter,
    );
    if (!brief.claim && plan.claim) {
      plan = { ...plan, claim: plan.claim };
    }
    job.brief = brief.claim ? brief : applyBriefDefaults(brief, plan.claim);
    job.plan = { ...plan, claim: brief.claim || plan.claim };
    await stampCost(job, meter);
    await writeJob(outputPath, job);
  }
  const body = [
    briefSidecar(job.brief),
    formatPlan(job.plan),
    job.notesMarkdown,
  ].join("\n\n");
  const notices = [research.error, blocked].filter(Boolean).join("\n\n");
  return notices ? `${notices}\n\n${body}` : body;
}

async function runDraft(data: WriterData): Promise<string> {
  await reloadEnv();
  const topic = data?.topic?.trim();
  if (!topic) return "No topic.";
  const outputPath = await resolveOutputPath(data, topic);
  const job = await ensureWriterJob(data, topic);
  const writer = writerModel(data);
  const meter = RunMeter.from(job.usage);
  const style = styleFromData(data as { style?: string } | undefined);
  let brief = job.brief;
  if (!job.researched) {
    brief = applyBriefDefaults(
      await parseBrief(topic, writer, meter),
    );
    job.brief = brief;
    await stampCost(job, meter);
    await writeJob(outputPath, job);
  }
  const needed = researchNeeded({ ...job, brief });
  if (needed) return needed;
  let plan = job.plan;
  if (plan.sections.length === 0) {
    plan = await planEssay(
      brief,
      job.notes,
      job.target,
      writer as ModelConfig,
      meter,
    );
  }
  if (!brief.claim && plan.claim) {
    brief = applyBriefDefaults(brief, plan.claim);
  }
  let essay = await draftEssay(
    brief,
    job.notes,
    plan,
    writer as ModelConfig,
    style.rules,
    meter,
  );
  essay = await fitLength(
    essay,
    brief,
    job.notes,
    plan,
    writer as ModelConfig,
    meter,
  );
  job.brief = brief;
  job.plan = { ...plan, claim: brief.claim || plan.claim };
  job.draft = essay;
  await stampCost(job, meter);
  await writeJob(outputPath, job);
  return essay;
}

async function runCritique(
  data: WriterData,
  essay: string,
): Promise<string> {
  await reloadEnv();
  const topic = data?.topic?.trim();
  if (!topic) return "No topic.";
  const outputPath = await resolveOutputPath(data, topic);
  const job = await ensureWriterJob(data, topic);
  const needed = researchNeeded(job);
  if (needed) return needed;
  const meter = RunMeter.from(job.usage);
  let leftover = leftoverFor(job, essay);
  const judged = await reviewEssay({
    brief: job.brief,
    notes: job.notes,
    essay,
    model: criticModel(data),
    meter,
    harness: leftover,
    plan: formatPlan(job.plan),
  });
  let review = applyPlanBounds(judged, leftover);
  let draft = essay;
  const count = job.critiqueCount ?? 0;
  const issues = mergeIssues(
    leftoverIssues(review.issues, essay),
    issuesFromHarness(leftover),
  );
  if (issues.length > 0 && count < 2) {
    draft = await revisePassages({
      brief: job.brief,
      notes: job.notes,
      essay,
      issues,
      model: writerModel(data),
      meter,
    });
    draft = await fitLength(
      draft,
      job.brief,
      job.notes,
      job.plan,
      writerModel(data) as ModelConfig,
      meter,
    );
    leftover = leftoverFor(job, draft);
    review = applyPlanBounds(judged, leftover);
  }
  job.review = review;
  job.leftover = leftover;
  job.draft = draft;
  job.critiqueCount = count + 1;
  await stampCost(job, meter);
  await writeJob(outputPath, job);
  return critiqueReply(job);
}

export async function persistWriterEssay(
  data: WriterData,
  title: string,
  markdown: string,
): Promise<{ job: WriterJob; error?: string }> {
  await reloadEnv();
  const topic = data?.topic?.trim() || title;
  const outputPath = await resolveOutputPath(data, topic);
  const job = await readWriterJob(outputPath) ?? stubWriterJob(data, topic, title);
  let essay = dropUnknownCitations(markdown, job.notes);
  essay = withSources(essay, job.notes);
  const published = publishedTitle(topic, job.plan.title, essay);
  const disk = essayForDisk(
    published,
    essay,
    job.target,
    Boolean(data?.keepOnFail),
  );
  job.draft = markdown;
  job.markdown = disk.markdown;
  job.slug = essayStem(outputPath);
  job.leftover = leftoverFor(job, disk.markdown);
  job.review = applyPlanBounds(job.review, job.leftover);
  job.layer1 = layer1Problems(
    disk.markdown,
    job.notes,
    job.articles,
    job.target,
    job.brief.text,
  );
  if (job.usage) {
    job.cost = formatRun(RunMeter.from(job.usage), await loadPrices());
  }
  job.notesMarkdown = notesRecord({
    notes: [
      job.researchError,
      formatAttributedNotes(job.notes) || "No sourced notes.",
    ].filter(Boolean).join("\n\n"),
    writerModel: writerModel(data).modelId ?? "writer",
    cost: job.cost,
    brief: briefSidecar(job.brief),
    plan: formatPlan(job.plan),
    critic: criticSidecar(job.review, job.leftover),
  });
  await writeOutputFile(outputPath, disk.markdown);
  await writeOutputFile(
    outputPath.replace(/\.md$/, ".notes.md"),
    job.notesMarkdown,
  );
  await writeJob(outputPath, job);
  if (disk.error) return { job, error: disk.error };
  if (job.layer1.length > 0 && !data?.keepOnFail) {
    return { job, error: `Layer 1 blocked save: ${job.layer1.join("; ")}` };
  }
  const boundError = leftoverSaveError(job.leftover);
  if (boundError && !data?.keepOnFail) {
    return { job, error: boundError };
  }
  return { job };
}

async function runSave(
  data: WriterData,
  title: string,
  markdown: string,
): Promise<string> {
  const topic = data?.topic?.trim() || title;
  const outputPath = await resolveOutputPath(data, topic);
  let job = await ensureWriterJob(data, topic);
  const needed = researchNeeded(job);
  if (needed) return needed;
  if (!(job.draft ?? "").trim()) {
    const drafted = await runDraft(data);
    if (
      drafted.startsWith("Call research first") ||
      drafted === "No topic."
    ) {
      return drafted;
    }
    job = await readWriterJob(outputPath) ?? job;
  }
  let incoming = markdown;
  if (bodyWordCount(incoming) < 80 && (job.draft ?? "").trim()) {
    incoming = job.draft ?? incoming;
  }
  const sameDraft = (job.draft ?? "").trim() === incoming.trim();
  const count = job.critiqueCount ?? 0;
  let latest = job;
  if (count === 0 || (!sameDraft && count < 2)) {
    await runCritique(data, incoming);
    latest = await readWriterJob(outputPath) ?? job;
  } else if (openCritiqueIssues(job).length > 0 && count < 2) {
    await runCritique(data, job.draft ?? incoming);
    latest = await readWriterJob(outputPath) ?? job;
  }
  if (
    openCritiqueIssues(latest).length > 0 && (latest.critiqueCount ?? 0) < 2
  ) {
    await runCritique(data, latest.draft ?? incoming);
    latest = await readWriterJob(outputPath) ?? latest;
  }
  const result = await persistWriterEssay(
    data,
    title,
    latest.draft ?? incoming,
  );
  if (result.error) return result.error;
  return `Saved output/${result.job.slug}.md`;
}

Writer.initialData = v.optional(v.object({
  topic: v.optional(v.string()),
  style: v.optional(v.picklist(STYLE_NAMES)),
  provider: v.optional(v.picklist(["haimaker", "mercury"])),
  model: v.optional(v.string()),
  checkModel: v.optional(v.string()),
  words: v.optional(v.number()),
  outputPath: v.optional(v.pipe(v.string(), v.minLength(1))),
  keepOnFail: v.optional(v.boolean()),
}));

export function Writer() {
  const data = useInitialData<WriterData>();
  useModel(modelFor(data), { thinkingLevel: "off" });

  useTool({
    name: "research",
    description:
      "Search and note sources when the brief needs checkable evidence, including architecture or implementation of a named system. Optional for humour, opinion, or known practice. If it reports a Tavily HTTP 401, 403, 429, or 432, do not call research again. If it reports the source floor, still draft from the brief. Do not invent statistics, studies, quotes, or sources.",
    input: v.object({}),
    run: ({ signal }) => nestRunSignal(signal, () => runResearch(data)),
  });

  useTool({
    name: "draft",
    description:
      "Write the essay from the job brief, plan, and notes, then fit length. Call after research, or instead of research when the brief does not need sources.",
    input: v.object({}),
    run: ({ signal }) => nestRunSignal(signal, () => runDraft(data)),
  });

  useTool({
    name: "critique",
    description:
      "Editorial assessment. save_essay runs this. Do not call it yourself.",
    input: v.object({
      markdown: v.pipe(v.string(), v.minLength(1)),
    }),
    run: ({ data: input, signal }) =>
      nestRunSignal(signal, () => runCritique(data, input.markdown)),
  });

  useTool({
    name: "save_essay",
    description:
      "Critique, revise, and save. Call once after draft. A leftover plan bound is a save error.",
    input: v.object({
      title: v.pipe(v.string(), v.minLength(1)),
      markdown: v.pipe(v.string(), v.minLength(1)),
    }),
    run: ({ data: input, signal }) =>
      nestRunSignal(signal, () => runSave(data, input.title, input.markdown)),
  });

  return [
    "Write a publishable essay from the user brief.",
    "Call research when the brief needs checkable evidence: news, policy, science, figures, other people's words, or architecture or implementation of a named system. Skip research for humour, opinion, or practice the audience already knows.",
    "If research reports a Tavily HTTP 401, 403, 429, or 432, do not call research again. Call draft from the brief. Do not invent statistics, studies, quotes, or sources.",
    "If research reports the source floor, still call draft from the brief. Do not invent statistics, studies, quotes, or sources.",
    "Call draft. Then call save_essay once with the drafted markdown and stop.",
    "Do not write the essay in chat. Do not call critique. save_essay is the editor and the file write.",
    "Sources and quotations are optional unless you use a figure, a quotation, or a sourced claim. Never invent statistics, studies, quotes, or sources.",
    `Target about ${data?.words ?? DEFAULT_ESSAY_LENGTH} words.`,
  ].join(" ");
}

Writer.durability = {
  maxAttempts: WRITER_MAX_ATTEMPTS,
  timeoutMs: WRITER_TIMEOUT_MS,
};
