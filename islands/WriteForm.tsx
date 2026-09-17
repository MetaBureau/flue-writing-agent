import { useEffect, useRef, useState } from "preact/hooks";
import {
  DEFAULT_WRITER_OPTION,
  WRITER_OPTIONS,
} from "../src/providers.ts";
import {
  DEFAULT_ESSAY_LENGTH,
  ESSAY_LENGTHS,
  type Piece,
  PROMPT_OPENING,
  type StageId,
  type StageStatus,
  pieceRank,
  WRITE_STAGES,
  type WriteEvent,
} from "../src/contract.ts";

interface Props {
  styles: string[];
  providerProblems?: Record<string, string>;
}

type StageMap = Record<StageId, StageStatus>;

function idleStages(): StageMap {
  return Object.fromEntries(
    WRITE_STAGES.map((stage) => [stage.id, "pending"]),
  ) as StageMap;
}

function stepClass(status: StageStatus): string {
  if (status === "done" || status === "active") return "step-primary";
  if (status === "warning") return "step-warning";
  if (status === "error") return "step-error";
  return "";
}

function pieceOrder(id: string): number {
  return pieceRank(id);
}

function upsertPiece(current: Piece[], piece: Piece): Piece[] {
  return [...current.filter((item) => item.id !== piece.id), piece].sort((
    left,
    right,
  ) => pieceOrder(left.id) - pieceOrder(right.id));
}

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type PromptAnswer = { question: string; answer: string };

function PromptInterview(
  { provider, model, topic, disabled, onPrompt }: {
    provider: string;
    model: string;
    topic: string;
    disabled: boolean;
    onPrompt: (prompt: string) => void;
  },
) {
  const seed = topic.trim();
  const [turns, setTurns] = useState<PromptAnswer[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [ready, setReady] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);

  async function ask(force: boolean) {
    const reply = answer.trim();
    const nextTurns = question.trim() && reply
      ? [...turns, { question, answer: reply }]
      : turns;
    if (!force && !question && !seed && turns.length === 0) {
      setError("");
      setQuestion(PROMPT_OPENING);
      return;
    }
    if (!force && question && !reply) {
      setError("Answer the question, or click Write the prompt.");
      return;
    }
    const subject = seed || reply;
    setAsking(true);
    setError("");
    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          seed: subject,
          turns: force && !reply ? turns : nextTurns,
          force,
        }),
      });
      const payload = await response.json() as {
        status?: string;
        question?: string;
        prompt?: string;
        error?: string;
      };
      if (!response.ok || payload.error) {
        setError(payload.error ?? "The prompt interview failed.");
        return;
      }
      setTurns(force && !answer.trim() ? turns : nextTurns);
      setAnswer("");
      if (payload.status === "ask" && payload.question) {
        setQuestion(payload.question);
        setReady("");
        return;
      }
      if (payload.status === "ready" && payload.prompt) {
        setQuestion("");
        setReady(payload.prompt);
        return;
      }
      setError("The prompt interview returned nothing.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The prompt interview failed.",
      );
    } finally {
      setAsking(false);
    }
  }

  function reset() {
    setTurns([]);
    setQuestion("");
    setAnswer("");
    setReady("");
    setError("");
  }

  return (
    <div class="flex flex-col gap-3">
      <h2 class="font-semibold">Prompt</h2>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm"
          disabled={disabled || asking || (Boolean(question) && !answer.trim())}
          onClick={() => ask(false)}
        >
          {asking
            ? <span class="loading loading-spinner loading-xs" />
            : question
            ? "Answer"
            : "Ask questions"}
        </button>
        {question || turns.length > 0
          ? (
            <button
              type="button"
              class="btn btn-sm btn-outline"
              disabled={disabled || asking}
              onClick={() => ask(true)}
            >
              Write the prompt
            </button>
          )
          : null}
        {turns.length > 0
          ? (
            <button type="button" class="btn btn-sm btn-ghost" onClick={reset}>
              Start over
            </button>
          )
          : null}
      </div>
      {turns.length > 0 || question
        ? (
          <div class="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {turns.map((turn, index) => (
              <div key={index}>
                <div class="chat chat-start">
                  <div class="chat-bubble">{turn.question}</div>
                </div>
                <div class="chat chat-end">
                  <div class="chat-bubble chat-bubble-primary">
                    {turn.answer}
                  </div>
                </div>
              </div>
            ))}
            {question
              ? (
                <div class="chat chat-start">
                  <div class="chat-bubble">{question}</div>
                </div>
              )
              : null}
          </div>
        )
        : null}
      {question
        ? (
          <textarea
            class="textarea w-full"
            rows={3}
            value={answer}
            placeholder="Your answer"
            onInput={(event) => setAnswer(event.currentTarget.value)}
          />
        )
        : null}
      {error ? <div class="alert alert-error">{error}</div> : null}
      {ready
        ? (
          <div class="flex flex-col gap-2">
            <pre class="whitespace-pre-wrap font-sans">{ready}</pre>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              onClick={() => onPrompt(ready)}
            >
              Use this prompt
            </button>
          </div>
        )
        : null}
    </div>
  );
}

function PieceModal(
  { piece, onClose }: { piece: Piece | null; onClose: () => void },
) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (piece && !node.open) node.showModal();
    if (!piece && node.open) node.close();
  }, [piece]);
  return (
    <dialog class="modal" ref={dialog} onClose={onClose}>
      <div class="modal-box flex w-11/12 max-w-3xl flex-col max-h-[calc(100vh-5em)]">
        <h3 class="text-lg font-bold">{piece?.label ?? "Document"}</h3>
        <div class="mt-4 min-h-0 overflow-y-auto">
          <pre class="whitespace-pre-wrap font-sans">{piece?.markdown ?? ""}</pre>
        </div>
        <div class="modal-action">
          <button
            type="button"
            class="btn"
            disabled={!piece}
            onClick={() =>
              piece && downloadMarkdown(piece.filename, piece.markdown)}
          >
            Download .md
          </button>
          <form method="dialog">
            <button class="btn" type="submit">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}

export default function WriteForm(
  { styles, providerProblems = {} }: Props,
) {
  const [topic, setTopic] = useState("Write an essay about pet cats.");
  const [words, setWords] = useState(DEFAULT_ESSAY_LENGTH);
  const [style, setStyle] = useState("economist");
  const [writer, setWriter] = useState<(typeof WRITER_OPTIONS)[number]["id"]>(
    DEFAULT_WRITER_OPTION.id,
  );
  const [stages, setStages] = useState<StageMap>(idleStages);
  const [detail, setDetail] = useState("");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [openId, setOpenId] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = WRITER_OPTIONS.find((option) => option.id === writer) ??
    DEFAULT_WRITER_OPTION;
  const providerProblem = providerProblems[selected.provider] ?? "";

  function applyEvent(event: WriteEvent) {
    if (event.type === "stage") {
      setStages((current) => ({ ...current, [event.id]: event.status }));
      if (event.detail) setDetail(event.detail);
      if (event.status === "warning" && event.detail) setWarning(event.detail);
      if (event.status === "error" && event.detail) setError(event.detail);
      return;
    }
    if (event.type === "piece") {
      setPieces((current) => upsertPiece(current, event.piece));
      return;
    }
    if (event.type === "essay") {
      setPieces((current) =>
        upsertPiece(current, {
          id: "essay",
          label: current.find((item) => item.id === "essay")?.label ?? "Essay",
          filename: event.filename,
          markdown: event.markdown,
        })
      );
      setError("");
      return;
    }
    setError(event.error);
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setWarning("");
    setDetail("");
    setPieces([]);
    setOpenId("");
    setStages(idleStages());
    try {
      const response = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          words,
          style,
          provider: selected.provider,
          model: selected.id,
        }),
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
          const line = frame.split("\n").find((item) =>
            item.startsWith("data: ")
          );
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
          <PromptInterview
            provider={selected.provider}
            model={selected.id}
            topic={topic}
            disabled={busy || Boolean(providerProblem)}
            onPrompt={setTopic}
          />
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
          <label class="label" for="words">Length</label>
          <select
            id="words"
            class="select w-full"
            value={words}
            onChange={(event) => setWords(Number(event.currentTarget.value))}
          >
            {ESSAY_LENGTHS.map((count) => (
              <option key={count} value={count}>{count} words</option>
            ))}
          </select>
          <label class="label" for="style">Style</label>
          <select
            id="style"
            class="select w-full"
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value)}
          >
            {styles.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <span class="label">Writer</span>
          <div class="flex flex-col gap-2">
            {WRITER_OPTIONS.map((option) => (
              <label class="label justify-start gap-3" key={option.id}>
                <input
                  type="radio"
                  name="writer"
                  class="radio radio-primary"
                  value={option.id}
                  checked={writer === option.id}
                  onChange={() => setWriter(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <button
            class="btn btn-primary"
            type="submit"
            disabled={busy || Boolean(providerProblem)}
          >
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
                {stages[stage.id] === "active"
                  ? <span class="loading loading-spinner loading-xs" />
                  : null}
              </li>
            ))}
          </ul>
          {detail ? <p class="text-sm">{detail}</p> : null}
        </div>
      </section>
      {providerProblem
        ? <div class="alert alert-error">{providerProblem}</div>
        : null}
      {warning ? <div class="alert alert-warning">{warning}</div> : null}
      {error ? <div class="alert alert-error">{error}</div> : null}
      {pieces.length > 0
        ? (
          <section class="card bg-base-100 shadow-sm">
            <div class="card-body gap-3">
              <h2 class="card-title">Documents</h2>
              <ul class="flex flex-col gap-2">
                {pieces.map((piece) => (
                  <li
                    key={piece.id}
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>{piece.label}</span>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="btn btn-sm"
                        onClick={() => setOpenId(piece.id)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline"
                        onClick={() =>
                          downloadMarkdown(piece.filename, piece.markdown)}
                      >
                        Download .md
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )
        : null}
      <PieceModal
        piece={pieces.find((piece) => piece.id === openId) ?? null}
        onClose={() => setOpenId("")}
      />
    </div>
  );
}
