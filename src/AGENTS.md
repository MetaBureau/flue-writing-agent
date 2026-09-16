# src

## Purpose

Runtime for the writing CLI: parse flags, resolve models, gather notes, run the pipeline, format output, write `output/<slug>.md`.

## Ownership

- `workflow.ts` — stage events for the form. Research, outline, drafts, extend, style, fact-check, then the essay markdown and a notes sidecar.
- `factcheck.ts` — match claims to note URLs, cite supported claims, and record unsupported or unchecked claims in the notes file
- `providers.ts` — HaiMaker and Mercury registry, each provider's curated `models` ids for the picker, and env resolution
- `catalog.ts` — public model hub parse, picker labels, and exact key model-list intersection. Empty intersection does not fall back to the curated ids
- `complete.ts` — streaming (and JSON fallback) chat completions, usage, and cut-off rejection
- `notes.ts` — Tavily search snippets; no raw page body
- `research.ts` — re-exports `notes.ts` for the Deno script
- `db.ts` — Flue sqlite adapter
- `flue.config.ts` — Flue node target

Parent root owns `deno.json` tasks and env templates. Child folders own drafting and style.

## Local Contracts

- HaiMaker auth is `Authorization: Bearer` plus `HAIMAKER_API_KEY`, as in the completions docs. Do not rewrite or reject the value before the request.
- `resolveProvider(name, "fast" | "reasoning", model?)` uses a chosen model for every stage when given, otherwise reads provider-specific env first, then shared `FAST_*` / `REASONING_*` when that provider is selected
- Completions POST to `${baseUrl}/chat/completions` with SSE; accept JSON if the server ignores `stream`
- Send `max_completion_tokens`, not `max_tokens`. Request `stream_options.include_usage`. Do not send `user` until a tagged call confirms the spend-log field
- Send `response_format` only when the catalog lists it. Anthropic caches the notes prefix only (`cachedPrefix`). The instruction and draft are a second system block with no `cache_control`
- Fact-check calls `CHECK_MODEL`, or the form checker, via `HAIMAKER_API_KEY`. Default is `openai/gpt-4.1`. If that id matches the writer, use another curated HaiMaker id. Auth and rate-limit errors propagate. A cut-off or empty verdict list saves the essay without citations and lists the claims in the notes file. Unsupported and unchecked claims stay out of the essay
- `finish_reason: "length"` throws `CutOffReply`. Callers must not use that content. Outline and drafts let it surface. Style and extend discard it. Fact-check catches only `CutOffReply`
- Do not send `reasoning_effort` unless the catalog lists it and the value is `low`, `medium`, or `high`. Omit it by default
- Picker labels say "can reason" when the catalog sets `supports_reasoning`. Do not label a model as reasoning by default from a trial table
- Research: advanced search, at most 5 sources, 180 words of the result snippet. No raw page body, no synthesized answer. Drop furniture sentences. A hit must name a distinctive word from the query. HTTP or network failure continues with the topic only. `gatherResearch` returns the hits, not only formatted text
- Notes start as `topic + research.text`. Page-description paragraphs are dropped before the outline. Those filtered notes are the only facts later stages may use
- Dry run prints config and does not call models or Tavily beyond the key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename. The same slug gets `output/<slug>.notes.md` with the notes, model ids, estimate, and fact-check findings

## Work Guidance

- Keep CLI flags aligned with `README.md`: `--provider`, `--model`, `--check-model`, `--style`, `--format`, `--verbose`, `--dry-run`
- Do not add a synthesized Tavily answer, extra research providers, or auth beyond Bearer API keys
- Provider names in `PROVIDERS` are `haimaker` and `mercury`
- Add a model to a provider's `models` only after a live chat call through `streamChat` returns plain text (no `<think>` output)
- The CLI `--model` passes any id through; the form only accepts ids in `models`

## Verification

`deno lint` and `deno check src/ routes/ islands/ tests/ main.ts client.ts define.ts flue.config.ts` must be clean. `deno task test` covers slug, word count, research query/payload helpers, and pipeline prompts. Live model and Tavily calls are not required for tests.

## Child DOX Index

- `src/agents/AGENTS.md` — Flue `Writer` agent, plus the older outline/draft/extend script
- `skills/AGENTS.md` — editorial style pass that may cut repetition and must not invent
