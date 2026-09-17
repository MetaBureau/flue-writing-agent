# src

## Purpose

Runtime for the writing CLI: parse flags, resolve models, gather notes, run the
pipeline, format output, write `output/<slug>.md`.

## Ownership

- `workflow.ts` — stage events for the form. Research, outline, drafts, synthesis,
  extend, style, fact-check, then piece events for notes, each draft, synthesis,
  and the essay, the essay markdown, and a notes sidecar.
- `factcheck.ts` — match claims to note URLs, cite supported claims, skip
  `not-a-claim`, and record unsupported or unchecked claims in the notes file
- `providers.ts` — HaiMaker and Mercury registry, each provider's curated
  `models` ids for the picker, and env resolution
- `catalog.ts` — public model hub parse, picker labels, and exact key model-list
  intersection. Empty intersection does not fall back to the curated ids
- `complete.ts` — streaming (and JSON fallback) chat completions, usage, and
  cut-off rejection
- `prompt.ts` — form interview that asks one question at a time and writes an essay prompt from the user's answers
- `notes.ts` — Tavily search snippets; no raw page body
- `research.ts` — re-exports `notes.ts` for the Deno script
- `db.ts` — Flue sqlite adapter
- `flue.config.ts` — Flue node target

Parent root owns `deno.json` tasks and env templates. Child folders own drafting
and style.

## Local Contracts

- HaiMaker auth is `Authorization: Bearer` plus `HAIMAKER_API_KEY`, as in the
  completions docs. Do not rewrite or reject the value before the request.
- `resolveProvider(name, "fast" | "reasoning", model?)` uses a chosen model for
  every stage when given, otherwise reads provider-specific env first, then
  shared `FAST_*` / `REASONING_*` when that provider is selected
- Completions POST to `${baseUrl}/chat/completions` with SSE; accept JSON if the
  server ignores `stream`
- Send `max_completion_tokens`, not `max_tokens`. Request
  `stream_options.include_usage`. Do not send `user` until a tagged call
  confirms the spend-log field
- Send `response_format` only when the catalog lists it. Anthropic caches the
  notes prefix only (`cachedPrefix`). The instruction and draft are a second
  system block with no `cache_control`
- Fact-check calls `CHECK_MODEL`, or the form checker, via `HAIMAKER_API_KEY`.
  Default is `openai/gpt-4.1`. If that id matches the writer, or `CHECK_MODEL`
  is not a HaiMaker picker id, use another curated id and log the replacement.
  No HaiMaker key skips fact-check before research
  (`no HaiMaker key; not checked`) and still saves the essay. A checker auth or
  rate-limit error saves the essay marked unchecked, then reports the error. A
  cut-off or empty verdict list saves without citations. Each source URL is
  linked once, in a Sources section. A link is not inserted into a sentence.
  Unsupported and unchecked claims stay in the essay and are listed in the
  notes file. Argument, interpretation, examples, transitions, and widely known
  general knowledge are `not-a-claim` and are omitted from those lists. The
  Sources list is not part of the body word count or the
  length floor
- `finish_reason: "length"` throws `CutOffReply`. Callers must not use that
  content. Outline lets it surface. A cut-off draft is dropped. The drafts
  stage fails only when none succeed. Synthesis uses `SYNTHESIS_MAX_TOKENS`
  (65,536) for Mercury so reasoning does not eat the merge cap, and
  `completionTokensForLength` when the writer merges. A longest-draft fallback
  is a warning, not a normal finish. Style and extend discard a cut-off.
  Fact-check catches only `CutOffReply`
- Do not send `reasoning_effort` unless the catalog lists it and the value is
  `low`, `medium`, or `high`. Omit it by default
- Picker labels say "can reason" when the catalog sets `supports_reasoning`. Do
  not label a model as reasoning by default from a trial table
- Research searches the subject, not the writing instruction
  (`essay on my pet cat` becomes `my pet cat`). Advanced search. Source count
  and excerpt length scale with the requested word count (`researchBudget`),
  up to 12 sources and 400 words. A second search uses outline section titles.
  Mill domains are excluded. No raw page body, no synthesized answer. Drop
  furniture sentences. A hit must name a subject word from the query, including
  a short word such as `cat`. HTTP or network failure continues with the topic
  only. `gatherResearch` returns the hits, not only formatted text
- Notes start as `topic + research.text`. Page-description paragraphs and
  sources about how to write an essay are dropped before the outline. Those
  filtered notes are the source for specific facts, figures, quotes, and named
  studies. Later stages may add argument and widely known general knowledge.
  Do not invent statistics, studies, quotes, or sources
- Extend weaves until the essay reaches `wordCountTarget` or hits the call cap.
  Each weave replaces the draft with the full essay, or is rejected. A reply
  that copies the draft and appends notes is rejected. A style rewrite must
  stay at or above `essayLengthFloor` (85% of the request). Saving below that
  floor throws. Style and extend discard a cut-off reply.
- Dry run prints config and does not call models or Tavily beyond the
  key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename. The slug is the topic, not
  the outline title. The same slug gets `output/<slug>.notes.md` with the notes,
  model ids, estimate, and fact-check findings
- Form `words` is an `ESSAY_LENGTHS` count. It sets `outline.wordCountTarget` and wins over a count in the topic. The CLI still uses `wordCountFromTopic`. The saved body must be at least `essayLengthFloor` of that count. `bodyWordCount` excludes the title, the `{n} words` line, and the Sources list. The saved essay writes that count under the title.
- Drafts use `DRAFT_MODELS` on HaiMaker when that key is set, otherwise the writer. Synthesis pins `mercury-2.5`. Empty drafts fail the drafts stage
- The form interview uses the writer model. It asks one question at a time, including when the topic is empty, stops after five answers, and does not invent facts. A reply that describes how to write an essay is discarded. The topic it fills is still the only brief the pipeline receives
- The form stream yields a notes piece after research, one piece per draft
  after drafts, a synthesis piece after synthesis, then replaces notes with the
  sidecar text and yields the essay piece when those files are saved. A
  longest-draft synthesis fallback yields stage status `warning`. Download
  names are `<slug>.md`, `<slug>.notes.md`, `<slug>.draft-<model-slug>.md`, and
  `<slug>.synthesis.md`. `notesRecord` lists the outline model, draft model ids,
  and synthesis model

## Work Guidance

- Keep CLI flags aligned with `README.md`: `--provider`, `--model`,
  `--check-model`, `--style`, `--format`, `--verbose`, `--dry-run`
- Do not add a synthesized Tavily answer, extra research providers, or auth
  beyond Bearer API keys
- Provider names in `PROVIDERS` are `haimaker` and `mercury`
- Add a model to a provider's `models` only after a live chat call through
  `streamChat` returns plain text (no `<think>` output)
- The CLI `--model` passes any id through; the form only accepts ids in `models`

## Verification

`deno lint` and
`deno check src/ routes/ islands/ tests/ main.ts client.ts define.ts flue.config.ts`
must be clean. `deno task test` covers slug, word count, research query/payload
helpers, and pipeline prompts. Live model and Tavily calls are not required for
tests.

## Child DOX Index

- `src/agents/AGENTS.md` — Flue `Writer` agent, plus outline, parallel drafts,
  synthesis, and extend
- `skills/AGENTS.md` — editorial style pass that may cut repetition and must not
  invent statistics, studies, quotes, or sources
