# src

## Purpose

Runtime helpers the Flue agent uses: providers, Tavily notes, cite harness,
critic rubric. The writing run is `src/agents/run.ts`.

## Ownership

- `workflow.ts` — leftover `writeStages`. Unused by the form, CLI, and eval.
  Do not add stages.
- `brief.ts` — parse the topic into a `Brief`. The brief is the rulebook.
  `researchRequired` is true for architecture or implementation, or an
  explain-the-system brief
- `cite.ts` — citation, copy, quote-budget, and Layer 1 harness. Rejects an uncited
  figure or quote when notes exist, a citation to a missing note, an unquoted 8-word phrase
  with three distinctive words, quoted words over 15% of the body, a Sources
  list that does not match cited ids, a URL, markdown link, or call to
  action in the body, and a sentence that names "the notes", "the sources",
  or "this essay does not / cannot / will not / is unable". "The claim this
  essay advances" is not a process sentence. A year in the brief, or used as
  the essay's timeframe,
  is not a figure
- `critic.ts` — one review against the eight RFC 0003 rubric items as the
  brief's intended reader; receives the plan; returns an editorial assessment
  with rewrite notes for named passages, not a sentence to append. Sidecar is
  that assessment. `planBoundProblems` is leftover when a section purpose named
  overflow, conflict, aging, or failure and the essay omits that kind, answers
  a sibling, or leaves a menu of policies. `applyPlanBounds` fails advance on
  that leftover even if the critic model passed. `leftoverSaveError` is the
  save error for that leftover unless `keepOnFail`. Architecture briefs treat
  operational bounds as part of the claim. Empty notes still require an
  objection from a competent reader
- `output.ts` — topic slug, unused path so a run never overwrites an existing `.md`, atomic `output/` writes, and the Deno KV copy of that essay
- `essay_kv.ts` — chunked Deno KV blobs for `.md`, `.notes.md`, and `.job.json`. Local file is `data/essays.kv`. Deno Deploy uses the attached KV (`DENO_DEPLOYMENT_ID`). `flueSqliteFile` is `/tmp/flue.db` on Deploy.
- `providers.ts` — HaiMaker and Mercury registry, curated `models` ids, the
  form's three `WRITER_OPTIONS`, and env resolution
- `catalog.ts` — public model hub parse, picker labels, and exact key model-list
  intersection. Empty intersection does not fall back to the curated ids
- `complete.ts` — streaming (and JSON fallback) chat completions, usage,
  cut-off rejection, and `runFetchSignal` / `withRunSignal` for run abort
- `prompt.ts` — form interview that asks one question at a time and writes an essay prompt from the user's answers
- `notes.ts` — Tavily search, counter-search, extract of full articles, structured notes
- `research.ts` — re-exports `notes.ts` for the Deno script
- `db.ts` — Flue sqlite adapter (`flueSqliteFile`)
- `flue.config.ts` — Flue node target

Parent root owns `deno.json` tasks and env templates. Child folders own drafting
and style catalogs.

## Local Contracts

- HaiMaker auth is `Authorization: Bearer` plus `HAIMAKER_API_KEY`, as in the
  completions docs. Do not rewrite or reject the value before the request.
- `resolveProvider(name, "fast" | "reasoning", model?)` uses a chosen model for
  every stage when given, otherwise reads provider-specific env first, then
  shared `FAST_*` / `REASONING_*` when that provider is selected
- Completions POST to `${baseUrl}/chat/completions` with SSE; accept JSON if the
  server ignores `stream`. One `RunMeter` lives on the job (`usage`). `formatRun`
  uses `loadPrices()` from the model hub. `streamChat` and Tavily fetch use
  `runFetchSignal` (call timeout plus the `writeWithFlue` abort). `withRunSignal`
  scopes that abort across tool HTTP
- Send `max_completion_tokens`, not `max_tokens`. Request
  `stream_options.include_usage`. Do not send `user` until a tagged call
  confirms the spend-log field
- Send `response_format` only when the catalog lists it. Anthropic caches the
  notes prefix only (`cachedPrefix`). The instruction and draft are a second
  system block with no `cache_control`. Draft, expand, shorten, and revise pass
  catalog `supportedParams`
- The selected writer runs notes extraction, plan, draft, length fit, and
  `revisePassages`. The
  critic is Gemini 3.5 Flash (`google/gemini-3.5-flash`) unless `--check-model`
  or `CHECK_MODEL` sets another HaiMaker id. If that id is the writer,
  `resolveCheckModel` uses the other of Sonnet 5 and Gemini 3.5 Flash.
  `writeWithFlue` and `Writer` pass that id into `critique`. There is no separate
  Flash Lite fact-check and no HaiMaker draft trio. Form default writer is Claude
  Sonnet 5. Critique always needs `HAIMAKER_API_KEY`. A missing writer key
  errors on the brief stage
- `finish_reason: "length"` throws `CutOffReply` with the truncated content.
  Callers must not treat a cut-off critic as an all-pass unless that content
  does not parse. A cut-off plan falls back to a title stub. A cut-off notes
  turn falls back to article excerpts. A cut-off draft fails the run. Expand,
  shorten, and revise keep the current essay on cut-off. Critic
  `max_completion_tokens` is 4096
- Do not send `reasoning_effort` unless the catalog lists it and the value is
  `low`, `medium`, or `high`. Omit it by default
- Picker labels say "can reason" when the catalog sets `supports_reasoning`. Do
  not label a model as reasoning by default from a trial table
- Research searches `researchQuery(brief)` plus `counterQuery(brief)`. Advanced
  search. No synthesized answer, no search `raw_content`. Deduplicate by
  canonical URL, title, and same-publisher similar title (HTML and PDF of one
  report count as one). Block mill domains, content farms, and Facebook,
  Twitter, Reddit, Instagram, and TikTok. Extract `extractLimitFor(words)` hits
  in full (`TAVILY_EXTRACT_URL`). HTTP or network failure continues with the topic
  only and stores Tavily's status and error body on the job (`researchError`).
  Do not swallow a 432 key usage cap as 0 sources. Extract HTTP failure or empty extract uses search snippets so notes
  are not blank after a hit. Research is optional on the Writer except when
  `researchRequired`: architecture or implementation, or an explain-the-system
  brief. When it
  runs, re-query toward `noteFloor`: 6 notes for
  500–1000 words, 8 through 2000, 10 above. Below the floor, `supplementResearch`
  re-queries the search pair, then a probe plan's gap list. Still below the
  floor, `research` still plans and `draft` still writes from the brief.
  `researchFloorMessage` is a warning. A hit is relevant if it names any
  distinctive subject word.
  Encyclopaedias and live blogs
  count toward the floor but cannot be a section's only support
- Structured notes keep id, URL, author, outlet, date, stance, and claims with
  quotes. The outlet is the publication that owns the URL's domain. A claimed
  outlet that does not match the host is replaced with the host brand. Claims
  whose quotes are not in the article, or that fail `relevantToQuery` against
  the brief subject, are dropped. Writers receive `formatAttributedNotes`. Do
  not strip Source or URL lines. Do not mix sentences across sources
- `parseBrief` runs first on the writer model. No key, a cut-off, or invalid
  JSON falls back to the verbatim topic and a `searchQuery` subject. That does
  not fail the run. `brief` is required on `systemMessage`. The interview does
  not get it. The brief is the rulebook. A missing purpose defaults to
  persuading the stated audience of the claim. Only the brief may require
  humour. Do not add a wit rule the brief did not state
- Plan maps each section to note ids, names counter-arguments, and names gaps.
  If the brief has no claim, the plan proposes one the notes can support and
  records it in the sidecar. At most three sections at 500–700 words, four
  through 1500, five through 2500, six above that. Do not label a section
  Introduction or Conclusion. When the brief is architecture or implementation
  for a technical reader, each section's purpose includes that mechanism's
  operational bound as one committed policy. `draft` writes one essay from the
  brief, and from that plan when research ran. If research was skipped, it
  plans from the brief. Paraphrase when notes exist; quoted words stay under
  15% of the body. Cite `[n3]` after a figure, quote, or attributed claim when
  notes exist. Sources and quotations are optional otherwise. Name the outlet
  or author the first time, not in every sentence. Essays of 700 words or fewer
  are continuous prose. If the draft is
  under `essayLengthFloor`, one expand pass fills thin sections from notes
  already in the plan. If it is over `essayLengthCeiling`, one shorten pass
  cuts filler. Length is fitted again after critic revise. It does not weave
  unused notes or trim in code
- `cite.ts` rejects a figure or quote with no citation when notes exist, a citation to a missing
  note, an 8-word phrase copied from an extracted article unless it is in
  quotation marks or has fewer than three distinctive words, and a quote share
  over 15%. An essay with no notes and no citations does not need a Sources
  list. A year in the brief is not a figure. The critic judges the eight
  RFC 0003 rubric items (claim, advance, objection, fidelity, voice, audience,
  takeaway, silence) as the brief's intended reader. On an architecture or
  implementation brief, a mechanism without an operational bound fails advance,
  and objection is the strongest counter a competent reader would raise when
  notes are empty. Critique receives the plan. If a section purpose named a
  bound, answering a different failure mode fails advance. A timeout or
  fail-open policy does not cover overflow. A menu of alternative policies
  with the choice left open does not pass. The critic review and the harness merge; harness findings
  are not dropped when the critic also returns issues. `planBoundProblems` is
  leftover when the plan named a bound the essay does not state as that kind.
  `applyPlanBounds` fails advance on that leftover. Process sentences map
  to a rewrite, not a cite. A citation to a missing note, including when notes
  are empty, maps to removing that id.   `runCritique` critiques, calls
  `revisePassages` on the writer model for open issues, fits length, then stores
  the rewritten draft. `draft` writes from the job brief, plan, and notes, then
  fits length. `save_essay` drafts if that step was skipped, then persists
  that draft. The sidecar is the editorial
  assessment. `save_essay` will critique if the
  agent skipped it. After two critiques, leftover Layer 2 issues go to the
  sidecar and the `.md` is written. `leftoverSaveError` is a save error for a
  leftover plan bound unless `keepOnFail`. Unknown `[nX]` ids are then stripped. Leftover copied phrases are
  quoted in place only if that stays under the quote budget. The sidecar
  records only remaining issues. Leftover Layer 1 or length problems still
  write the `.md` and record the error on the job. `writeWithFlue` persists a
  chat reply or critique draft when `save_essay` was not called. A cancelled run
  does not take that recovery path. Save strips
  body links, URLs, and calls to action. A sentence that names "the notes", "the sources", or
  "this essay" followed by does not / cannot / will not / is unable is a
  harness fail. `## Sources` is built from cited note ids
- Style names still exist. They go into the draft prompt. There is no style
  rewrite pass
- Dry run prints config and does not call models or Tavily beyond the
  key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename, and the same body in Deno KV.
  The slug is the topic, not the plan title. If that `.md` already exists on
  disk or in KV, the run uses `<slug>-2.md` and up. The same stem gets
  `.notes.md` and `.job.json`. On Deno Deploy, a failed disk write is ignored
  after the KV write. `readWriterJob` reads KV first, then the file. Local CLI
  still leaves `output/` for `WRITE.md`. `ESSAY_KV_PATH` selects a KV file
  (`:memory:` in tests). Unset on Deploy. `onDeploy` is true when
  `DENO_DEPLOYMENT_ID` is set.
- Form `words` is an `ESSAY_LENGTHS` count and wins over a count in the topic.
  The CLI still uses `wordCountFromTopic`. `bodyWordCount` excludes the title,
  the `{n} words` line, and the Sources list
- The form interview uses the writer model. It asks one question at a time,
  including when the topic is empty, stops after five answers, and does not
  invent facts. A reply that describes how to write an essay is discarded. The
  topic it fills is still the only brief the pipeline receives
- The form stream starts with a 2KB SSE comment pad, then Brief active, detail
  Writer running, plus `: ping` heartbeats. It polls the job sidecar (KV, then
  `job.json`) and advances
  Brief, Research, Plan, Draft, Critic when those fields exist. Skipped research
  is a warning. Then the sidecar notes and the essay. Closing the stream aborts
  Writer. Download names are `<slug>.md`,
  `<slug>.notes.md`, `<slug>.plan.md`, `<slug>.draft.md`, and
  `<slug>.critic.md`. `notesRecord` lists the writer model, brief, plan, and
  critic

## Work Guidance

- Keep CLI flags aligned with `README.md`: `--provider`, `--model`,
  `--check-model`, `--style`, `--format`, `--verbose`, `--dry-run`
- Do not add a synthesized Tavily answer, extra research providers, or auth
  beyond Bearer API keys
- Provider names in `PROVIDERS` are `haimaker` and `mercury`
- Add a model to a provider's `models` only after a live chat call through
  `streamChat` returns plain text (no `<think>` output)
- The CLI `--model` passes any id through; the form posts one of `WRITER_OPTIONS`
- Do not restore `writerFacts`, three-draft merge, weave, `capEssayLength`,
  `finishEssay` regex cuts, `BRIEF_CHECK_RULE`, or Flash Lite claim matching

## Verification

`deno lint` and
`deno check src/ routes/ islands/ tests/ main.ts client.ts define.ts flue.config.ts`
must be clean. `deno task test` covers slug, word count, research helpers,
attributed notes, citation and copy harnesses, and pipeline prompts. Live model
and Tavily calls are not required for tests.

## Child DOX Index

- `src/agents/AGENTS.md` — `Writer` agent and `writeWithFlue`
- `skills/AGENTS.md` — style catalog used as draft wording guidance
