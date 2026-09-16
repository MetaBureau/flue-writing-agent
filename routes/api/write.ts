import { define } from "../../define.ts";
import type { WriteEvent } from "../../src/contract.ts";
import { STYLE_NAMES, isStyleName } from "../../src/skills/styles.ts";
import { PROVIDERS, isProviderModel } from "../../src/providers.ts";
import { writeStages } from "../../src/workflow.ts";

function eventStream(input: {
  topic: string;
  style: typeof STYLE_NAMES[number];
  provider?: string;
  model?: string;
  checkModel?: string;
}): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: WriteEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of writeStages(input)) send(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The writer failed.";
        send({ type: "error", stage: "research", error: message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
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
    } | null;
    const topic = body?.topic?.trim() ?? "";
    const style = body?.style ?? "professional";
    const provider = body?.provider || undefined;
    const model = body?.model || undefined;
    const checkModel = body?.checkModel || undefined;
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
    return eventStream({ topic, style, provider, model, checkModel });
  },
});
