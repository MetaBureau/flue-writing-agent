# src

## Purpose

Runtime for the writing CLI: parse flags, resolve models, gather notes, run the
pipeline, format output, write `output/<slug>.md`.

## Ownership

- `workflow.ts` — stage events for the form. Brief, research, outline, drafts, synthesis,
  extend, style, brief-check, fact-check, then piece events for notes, each draft, synthesis,
  a brief revision when one is kept, and the essay, the essay markdown, and a notes sidecar.
- `brief.ts` — parse the topic into a `Brief`, judge the styled essay, and revise once
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
  Default is `google/gemini-3.1-flash-lite`. The checker may match the writer.
  It must differ from `DRAFT_MODELS`. If the chosen id is a drafter, use the
  default, or `openai/gpt-4.1` when the default is also a drafter. If
  `CHECK_MODEL` is not a HaiMaker picker id, use the default and log the
  replacement. Do not fall back to DeepSeek or the first other picker id.
  No HaiMaker key skips fact-check before research
  (`no HaiMaker key; not checked`) and still saves the essay. A checker auth or
  rate-limit error saves the essay marked unchecked, then reports the error.
  Claims are numbered and checked in batches of 25. The checker returns
  `{i, status, url}` and does not repeat the claim text. Each batch's token cap
  scales with its claim count. A cut-off batch leaves those claims unchecked;
  the other batches are kept. A cut-off of every batch, or an empty verdict
  list, saves without citations. Each source URL is
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
- Research searches the subject plus claim content words
  (`researchQuery`), not the writing instruction
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
- `parseBrief` runs first on the writer model. No key, a cut-off, or invalid
  JSON falls back to the verbatim topic and a `searchQuery` subject. That does
  not fail the run. Research searches `researchQuery(brief)`: subject plus
  claim content words. `brief` is required on `systemMessage` and `stageSystem`.
  `briefBlock` starts the cached prefix for outline, drafts, synthesis, extend,
  style, and the brief revision, including a style pass with empty notes.
  Fact-check uses `notesPrefix` and does not get the brief. The interview does
  not get it. Brief-check uses the checker model. It is told the measured word count and
  must not judge length. A word-count miss does not force a revision. It fails
  pasted source text, a source headline, a body link or URL, a call to action,
  and a stretch that does not serve the claim. When the purpose is amusement,
  a solemn or merely elevated tone fails; a pass needs actual wit. A leftover
  link or call to action fails even when the model says pass. It revises at
  most once on Mercury. The revision treats repetition as a fault. The saved
  essay is capped at 115% of the target. A skip, or a failed check that
  keeps the styled essay, is a warning. The notes sidecar records the parsed
  brief and the verdict. Save strips body links, URLs, and calls to action.
  `## Sources` links stay
- Extend weaves until the essay reaches `wordCountTarget` or hits the call cap.
  Each weave replaces the draft with the full essay, or is rejected. A reply
  that copies the draft and appends notes is rejected. A style rewrite must
  stay between `essayLengthFloor` (85%) and `essayLengthCeiling` (115%). Saving
  below that floor throws. A longer essay is trimmed from the body, keeping
  the opening and the close. Style and extend discard a cut-off reply.
- Dry run prints config and does not call models or Tavily beyond the
  key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename. The slug is the topic, not
  the outline title. The same slug gets `output/<slug>.notes.md` with the notes,
  model ids, estimate, and fact-check findings
- Form `words` is an `ESSAY_LENGTHS` count. It sets `outline.wordCountTarget` and wins over a count in the topic. The CLI still uses `wordCountFromTopic`. The saved body must be at least `essayLengthFloor` of that count. `bodyWordCount` excludes the title, the `{n} words` line, and the Sources list. The saved essay writes that count under the title.
- Drafts use `DRAFT_MODELS` on HaiMaker when that key is set, otherwise the writer. Synthesis pins `mercury-2.5`. Empty drafts fail the drafts stage
- The form interview uses the writer model. It asks one question at a time, including when the topic is empty, stops after five answers, and does not invent facts. A reply that describes how to write an essay is discarded. The topic it fills is still the only brief the pipeline receives
- The form stream yields a notes piece after research, one piece per draft
  after drafts, a synthesis piece after synthesis, a brief-check piece only when
  a revision is kept, then replaces notes with the
  sidecar text and yields the essay piece when those files are saved. A
  longest-draft synthesis fallback yields stage status `warning`. A skipped
  brief check, or a failed check that keeps the styled essay, also yields
  `warning`. Download
  names are `<slug>.md`, `<slug>.notes.md`, `<slug>.draft-<model-slug>.md`,
  `<slug>.synthesis.md`, and `<slug>.brief.md` when a revision is kept.
  `notesRecord` lists the outline model, draft model ids,
  synthesis model, the parsed brief, and the brief-check verdict

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
