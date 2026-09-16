import { useState } from "preact/hooks";
import type { ModelChoice } from "../src/providers.ts";
import { WRITE_STAGES, type StageId, type StageStatus, type WriteEvent } from "../src/contract.ts";

interface Props {
  styles: string[];
  providers: string[];
  models: Record<string, ModelChoice[]>;
  providerProblems?: Record<string, string>;
}

type StageMap = Record<StageId, StageStatus>;

function idleStages(): StageMap {
  return {
    research: "pending",
    outline: "pending",
    drafts: "pending",
    style: "pending",
    extend: "pending",
  };
}

function stepClass(status: StageStatus): string {
  if (status === "done" || status === "active") return "step-primary";
  if (status === "error") return "step-error";
  return "";
}

export default function WriteForm({ styles, providers, models, providerProblems = {} }: Props) {
  const [topic, setTopic] = useState("Write a 900 word essay about pet cats.");
  const [style, setStyle] = useState("economist");
  const [provider, setProvider] = useState(providers[0] ?? "mercury");
  const [model, setModel] = useState(models[providers[0] ?? "mercury"]?.[0]?.id ?? "");
  const [stages, setStages] = useState<StageMap>(idleStages);
  const [detail, setDetail] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const providerProblem = providerProblems[provider] ?? "";

  function applyEvent(event: WriteEvent) {
    if (event.type === "stage") {
      setStages((current) => ({ ...current, [event.id]: event.status }));
      if (event.detail) setDetail(event.detail);
      if (event.status === "error" && event.detail) setError(event.detail);
      return;
    }
    if (event.type === "essay") {
      setMarkdown(event.markdown);
      setError("");
      return;
    }
    setError(event.error);
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDetail("");
    setMarkdown("");
    setStages(idleStages());
    try {
      const response = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, style, provider, model }),
      });
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const payload = await response.json() as { error?: string };
        setError(payload.error ?? "The writer failed.");
        return;
      }
      if (!response.body) {
        setError("The writer returned no stream.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          applyEvent(JSON.parse(line.slice(6)) as WriteEvent);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The writer failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex flex-col gap-6">
      <form class="card bg-base-100 shadow-sm" onSubmit={onSubmit}>
        <div class="card-body gap-4">
          <h1 class="card-title">Flue writer</h1>
          <label class="label" for="topic">Topic</label>
          <textarea
            id="topic"
            class="textarea w-full"
            rows={4}
            value={topic}
            onInput={(event) => setTopic(event.currentTarget.value)}
          >
            {topic}
          </textarea>
          <label class="label" for="style">Style</label>
          <select
            id="style"
            class="select w-full"
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value)}
          >
            {styles.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <label class="label" for="provider">Provider</label>
          <select
            id="provider"
            class="select w-full"
            value={provider}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setProvider(next);
              setModel(models[next]?.[0]?.id ?? "");
            }}
          >
            {providers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <label class="label" for="model">Model</label>
          <select
            id="model"
            class="select w-full"
            value={model}
            onChange={(event) => setModel(event.currentTarget.value)}
          >
            {(models[provider] ?? []).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select>
          <button class="btn btn-primary" type="submit" disabled={busy || Boolean(providerProblem)}>
            {busy ? <span class="loading loading-spinner" /> : "Write"}
          </button>
        </div>
      </form>
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body gap-3">
          <h2 class="card-title">Stages</h2>
          <ul class="steps steps-vertical">
            {WRITE_STAGES.map((stage) => (
              <li key={stage.id} class={`step ${stepClass(stages[stage.id])}`}>
                {stage.label}
                {stages[stage.id] === "active" ? <span class="loading loading-spinner loading-xs" /> : null}
              </li>
            ))}
          </ul>
          {detail ? <p class="text-sm">{detail}</p> : null}
        </div>
      </section>
      {providerProblem ? <div class="alert alert-error">{providerProblem}</div> : null}
      {error ? <div class="alert alert-error">{error}</div> : null}
      {markdown
        ? (
          <article class="card bg-base-100 shadow-sm">
            <div class="card-body prose max-w-none">
              <pre class="whitespace-pre-wrap font-sans">{markdown}</pre>
            </div>
          </article>
        )
        : null}
    </div>
  );
}
