import { define } from "../../define.ts";
import {
  DEFAULT_ESSAY_LENGTH,
  ESSAY_LENGTHS,
  criticPiece,
  draftPiece,
  essayPiece,
  isEssayLength,
  notesPiece,
  planPiece,
  SSE_PADDING,
  sseComment,
  sseData,
  type StageId,
  type WriteEvent,
} from "../../src/contract.ts";
import {
  bodyWordCount,
  formatPlan,
} from "../../src/agents/write.ts";
import {
  isWriterAbort,
  writeWithFlue,
} from "../../src/agents/run.ts";
import {
  readWriterJob,
  type WriterJob,
} from "../../src/agents/writer.ts";
import { briefStageDetail } from "../../src/brief.ts";
import { criticSidecar } from "../../src/critic.ts";
import { STYLE_NAMES, isStyleName } from "../../src/skills/styles.ts";
import { PROVIDERS, isProviderModel } from "../../src/providers.ts";
import { topicSlug, unusedEssayPath } from "../../src/output.ts";

type Seen = {
  brief?: boolean;
  research?: boolean;
  plan?: boolean;
  draft?: boolean;
  critic?: boolean;
};

function emitFromJob(
  job: WriterJob,
  seen: Seen,
  send: (event: WriteEvent) => void,
): void {
  const slug = job.slug;
  if (!seen.brief && job.brief.text) {
    send({
      type: "stage",
      id: "brief",
      status: "done",
      detail: briefStageDetail(job.brief),
    });
    seen.brief = true;
    send({ type: "stage", id: "research", status: "active" });
  }
  if (!seen.research && job.researched) {
    send({
      type: "piece",
      piece: notesPiece(slug, `${job.notesMarkdown}\n`),
    });
    send({
      type: "stage",
      id: "research",
      status: "done",
      detail: `${job.notes.length} notes`,
    });
    seen.research = true;
    send({ type: "stage", id: "plan", status: "active" });
  }
  if (!seen.research && job.draft?.trim() && !job.researched) {
    send({
      type: "stage",
      id: "research",
      status: "warning",
      detail: "skipped",
    });
    seen.research = true;
    send({ type: "stage", id: "plan", status: "active" });
  }
  if (!seen.plan && job.plan.sections.length > 0) {
    send({
      type: "piece",
      piece: planPiece(slug, formatPlan(job.plan)),
    });
    send({
      type: "stage",
      id: "plan",
      status: "done",
      detail: job.plan.title,
    });
    seen.plan = true;
    send({ type: "stage", id: "draft", status: "active" });
  }
  if (!seen.draft && job.draft?.trim()) {
    send({
      type: "piece",
      piece: draftPiece(slug, job.draft),
    });
    send({
      type: "stage",
      id: "draft",
      status: "done",
      detail: `${bodyWordCount(job.draft)} words`,
    });
    seen.draft = true;
    send({ type: "stage", id: "critic", status: "active" });
  }
  if (!seen.critic && (job.critiqueCount ?? 0) > 0) {
    send({
      type: "piece",
      piece: criticPiece(
        slug,
        `${criticSidecar(job.review, job.leftover)}\n`,
      ),
    });
    send({
      type: "stage",
      id: "critic",
      status: job.layer1.length > 0 || job.leftover.length > 0
        ? "warning"
        : "done",
    });
    seen.critic = true;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function eventStream(input: {
  topic: string;
  style: typeof STYLE_NAMES[number];
  provider?: string;
  model?: string;
  checkModel?: string;
  words: number;
  signal: AbortSignal;
}): Response {
  const run = new AbortController();
  const abortRun = () => {
    if (!run.signal.aborted) run.abort();
  };
  input.signal.addEventListener("abort", abortRun, { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const enqueue = (text: string) => {
        if (closed || run.signal.aborted) {
          abortRun();
          return;
        }
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
          abortRun();
        }
      };
      const send = (event: WriteEvent) => enqueue(sseData(event));
      let stop = false;
      let poll: Promise<void> = Promise.resolve();
      const seen: Seen = {};
      try {
        enqueue(SSE_PADDING);
        send({
          type: "stage",
          id: "brief",
          status: "active",
          detail: "Writer running",
        });
        const slug = topicSlug(input.topic);
        const outputPath = await unusedEssayPath(`output/${slug}.md`);
        poll = (async () => {
          while (!stop && !run.signal.aborted) {
            const job = await readWriterJob(outputPath);
            if (job) emitFromJob(job, seen, send);
            enqueue(sseComment("ping"));
            await sleep(400, run.signal);
          }
        })();
        const result = await writeWithFlue({
          topic: input.topic,
          style: input.style,
          provider: input.provider,
          model: input.model,
          checkModel: input.checkModel,
          words: input.words,
          outputPath,
          signal: run.signal,
        });
        stop = true;
        await poll;
        if (run.signal.aborted) return;
        emitFromJob(result, seen, send);
        const savedSlug = result.slug || slug;
        send({
          type: "piece",
          piece: essayPiece(
            savedSlug,
            result.markdown,
            bodyWordCount(result.markdown),
          ),
        });
        send({
          type: "essay",
          markdown: result.markdown,
          filename: `${savedSlug}.md`,
        });
      } catch (error) {
        stop = true;
        await poll;
        if (isWriterAbort(error) || run.signal.aborted) return;
        const message = error instanceof Error
          ? error.message
          : "The writer failed.";
        const stage: StageId = seen.critic
          ? "critic"
          : seen.draft
          ? "draft"
          : seen.plan
          ? "plan"
          : seen.research
          ? "research"
          : "brief";
        send({ type: "stage", id: stage, status: "error", detail: message });
        send({ type: "error", stage, error: message });
      } finally {
        stop = true;
        abortRun();
        closed = true;
        input.signal.removeEventListener("abort", abortRun);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      abortRun();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-encoding": "identity",
      "x-accel-buffering": "no",
    },
  });
}

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json().catch(() => null) as {
      topic?: string;
      style?: string;
      provider?: string;
      model?: string;
      checkModel?: string;
      words?: number;
    } | null;
    const topic = body?.topic?.trim() ?? "";
    const style = body?.style ?? "professional";
    const provider = body?.provider || undefined;
    const model = body?.model || undefined;
    const checkModel = body?.checkModel || undefined;
    const words = body?.words ?? DEFAULT_ESSAY_LENGTH;
    if (!topic) {
      return Response.json({ error: "Topic is required." }, { status: 400 });
    }
    if (!isStyleName(style)) {
      return Response.json(
        { error: `Style must be one of ${STYLE_NAMES.join(", ")}.` },
        { status: 400 },
      );
    }
    if (provider && !(provider in PROVIDERS)) {
      return Response.json({ error: "Unknown provider." }, { status: 400 });
    }
    if (model && !isProviderModel(provider ?? "mercury", model)) {
      return Response.json({ error: "Unknown model for that provider." }, { status: 400 });
    }
    if (checkModel && !isProviderModel("haimaker", checkModel)) {
      return Response.json({ error: "Unknown checker model." }, { status: 400 });
    }
    if (!isEssayLength(words)) {
      return Response.json(
        { error: `Length must be one of ${ESSAY_LENGTHS.join(", ")} words.` },
        { status: 400 },
      );
    }
    return eventStream({
      topic,
      style,
      provider,
      model,
      checkModel,
      words,
      signal: ctx.req.signal,
    });
  },
});
