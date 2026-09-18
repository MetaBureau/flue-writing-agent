import { AgentRunError, init } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { withRunSignal } from "../complete.ts";
import { DEFAULT_ESSAY_LENGTH } from "../contract.ts";
import { flueSqliteFile } from "../essay_kv.ts";
import { topicSlug, unusedEssayPath } from "../output.ts";
import { resolveCheckModel } from "../providers.ts";
import { isStyleName, type StyleName } from "../skills/styles.ts";
import { recoverableEssay } from "./write.ts";
import {
  persistWriterEssay,
  readWriterJob,
  Writer,
  writerProviders,
  type WriterData,
  type WriterJob,
} from "./writer.ts";

let booted: Promise<void> | undefined;

async function boot(): Promise<void> {
  const dbFile = flueSqliteFile();
  const slash = dbFile.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(dbFile.slice(0, slash), { recursive: true });
  try {
    await start({
      agents: [Writer],
      db: sqlite(dbFile),
      env: Deno.env.toObject(),
      providers: writerProviders,
    });
  } catch (error) {
    if (flueAlreadyConfigured(error)) return;
    throw error;
  }
}

export function flueAlreadyConfigured(error: unknown): boolean {
  return error instanceof Error &&
    error.message.includes("already-configured Flue runtime");
}

export type WriteJobResult = WriterJob;

export class WriterAbortedError extends Error {
  constructor() {
    super("The writer was cancelled.");
    this.name = "WriterAbortedError";
  }
}

export function isWriterAbort(error: unknown): boolean {
  if (error instanceof WriterAbortedError) return true;
  if (error instanceof AgentRunError && error.outcome === "aborted") return true;
  return error instanceof Error && error.name === "AbortError";
}

export async function writeWithFlue(input: {
  topic: string;
  style: string;
  provider?: string;
  model?: string;
  checkModel?: string;
  words?: number;
  outDir?: string;
  outputPath?: string;
  keepOnFail?: boolean;
  signal?: AbortSignal;
}): Promise<WriteJobResult> {
  const provider = input.provider === "mercury" ? "mercury" : "haimaker";
  if (provider === "mercury" && !Deno.env.get("FAST_MODEL_KEY")) {
    throw new Error("FAST_MODEL_KEY is not set.");
  }
  if (!Deno.env.get("HAIMAKER_API_KEY")) {
    throw new Error("HAIMAKER_API_KEY is not set.");
  }
  const style: StyleName = isStyleName(input.style) ? input.style : "professional";
  const words = input.words ?? DEFAULT_ESSAY_LENGTH;
  const writerId = provider === "mercury"
    ? "mercury-2.5"
    : (input.model || "anthropic/claude-sonnet-5");
  const checkModel = resolveCheckModel(
    writerId,
    input.checkModel ?? Deno.env.get("CHECK_MODEL"),
  );
  const slug = topicSlug(input.topic);
  const outDir = input.outDir ?? "output";
  const outputPath = input.outputPath ??
    await unusedEssayPath(`${outDir}/${slug}.md`);
  const signal = input.signal;
  if (signal?.aborted) throw new WriterAbortedError();

  try {
    booted ??= boot();
    await booted;
  } catch (error) {
    booted = undefined;
    throw error;
  }

  const id = crypto.randomUUID();
  const agent = init(Writer, { id });
  const abortAgent = () => {
    void agent.abort();
  };
  signal?.addEventListener("abort", abortAgent, { once: true });

  try {
    return await withRunSignal(signal, async () => {
      const initialData: WriterData = {
        topic: input.topic,
        style,
        provider,
        model: input.model,
        checkModel,
        words,
        outputPath,
        keepOnFail: input.keepOnFail,
      };
      const receipt = await agent.dispatch({
        message: input.topic,
        initialData,
      });
      let replyText = "";
      try {
        const reply = await agent.read(receipt, { signal });
        replyText = reply.text.trim();
      } catch (error) {
        const saved = await readWriterJob(outputPath);
        if (saved?.markdown) return saved;
        if (isWriterAbort(error) || signal?.aborted) {
          throw new WriterAbortedError();
        }
        if (!(error instanceof AgentRunError)) throw error;
        replyText = error.message;
      }
      const job = await readWriterJob(outputPath);
      if (job?.markdown) return job;
      if (signal?.aborted) throw new WriterAbortedError();
      const recovered = job?.draft?.trim() || recoverableEssay(replyText);
      if (recovered) {
        const saved = await persistWriterEssay(
          initialData,
          job?.plan.title || input.topic,
          recovered,
        );
        if (saved.job.markdown) return saved.job;
      }
      throw new Error(replyText || "The writer did not save an essay.");
    });
  } catch (error) {
    if (isWriterAbort(error) || signal?.aborted) {
      const saved = await readWriterJob(outputPath);
      if (saved?.markdown) return saved;
      throw new WriterAbortedError();
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortAgent);
  }
}
