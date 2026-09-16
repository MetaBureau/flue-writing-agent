import { init } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { Writer, writerProviders } from "./writer.ts";

let booted: Promise<void> | undefined;

async function boot(): Promise<void> {
  await Deno.mkdir("data", { recursive: true });
  await start({
    agents: [Writer],
    db: sqlite("./data/flue.db"),
    env: Deno.env.toObject(),
    providers: writerProviders,
  });
}

export async function writeWithFlue(input: {
  topic: string;
  style: string;
  provider?: string;
}): Promise<string> {
  const provider = input.provider === "haimaker" ? "haimaker" : "mercury";
  const keyName = provider === "haimaker" ? "HAIMAKER_API_KEY" : "FAST_MODEL_KEY";
  if (!Deno.env.get(keyName)) throw new Error(`${keyName} is not set.`);

  try {
    booted ??= boot();
    await booted;
  } catch (error) {
    booted = undefined;
    throw error;
  }

  const id = crypto.randomUUID();
  const outputPath = `output/${id}.md`;
  const agent = init(Writer, { id });
  const receipt = await agent.dispatch({
    message: input.topic,
    initialData: { style: input.style, provider, outputPath },
  });
  const reply = await agent.read(receipt);
  try {
    return await Deno.readTextFile(outputPath);
  } catch {
    if (reply.text.trim()) return reply.text;
    throw new Error("The writer did not save an essay.");
  }
}
