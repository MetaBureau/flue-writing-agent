# src

## Purpose

Runtime for the writing CLI: parse flags, resolve models, gather notes, run the pipeline, format output, write `output/<slug>.md`.

## Ownership

- `main.ts` — CLI, workflow orchestration, `topicSlug`, output formatting
- `providers.ts` — HaiMaker and Mercury registry and env resolution
- `complete.ts` — streaming (and JSON fallback) chat completions
- `research.ts` — Tavily search; excerpts only

Parent root owns `deno.json` tasks and env templates. Child folders own drafting and style.

## Local Contracts

- Default provider is Mercury when `--provider` and `FAST_PROVIDER` are unset
- `resolveProvider(name, "fast" | "reasoning")` reads provider-specific env first, then shared `FAST_*` / `REASONING_*` when that provider is selected
- Completions POST to `${baseUrl}/chat/completions` with SSE; accept JSON if the server ignores `stream`
- Research: at most 3 sources, 180-word excerpts, `include_answer: false`; HTTP or network failure continues with the topic only
- Notes are `topic + research.text`; they are the only facts later stages may use
- Dry run prints config and does not call models or Tavily beyond the key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename

## Work Guidance

- Keep CLI flags aligned with `README.md`: `--provider`, `--style`, `--format`, `--verbose`, `--dry-run`
- Do not add a synthesized Tavily answer, extra research providers, or auth beyond Bearer API keys
- Provider names in `PROVIDERS` are `haimaker` and `mercury`

## Verification

`deno task test` covers slug, word count, research query/payload helpers, and pipeline prompts. Live model and Tavily calls are not required for tests.

## Child DOX Index

- `agents/AGENTS.md` — outline, three drafts, style pick, note-grounded extension
- `skills/AGENTS.md` — editorial style pass that must not shorten or invent
