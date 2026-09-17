# src

## Purpose

Runtime for the writing CLI: parse flags, resolve models, gather attributed
notes, run plan → draft → critic, write `output/<slug>.md`.

## Ownership

- `workflow.ts` — stage events for the form. Brief, research, plan, draft,
  critic, then piece events for notes, plan, draft, critic, and the essay
- `brief.ts` — parse the topic into a `Brief`. The brief is the rulebook
- `cite.ts` — citation, copy, quote-budget, and Layer 1 harness. Rejects an uncited
  figure or quote, a citation to a missing note, an unquoted 8-word phrase
  with three distinctive words, quoted words over 15% of the body, a Sources
  list that does not match cited ids, a URL, markdown link, or call to
  action in the body, and a sentence that names "the notes", "the sources",
  or "this essay". A year in the brief, or used as the essay's timeframe,
  is not a figure
- `critic.ts` — one review against the eight RFC 0003 rubric items; passage-level
  fixes; sidecar records only remaining issues after revise
- `output.ts` — topic slug and atomic `output/` writes
- `providers.ts` — HaiMaker and Mercury registry, curated `models` ids, the
  form's three `WRITER_OPTIONS`, and env resolution
- `catalog.ts` — public model hub parse, picker labels, and exact key model-list
  intersection. Empty intersection does not fall back to the curated ids
- `complete.ts` — streaming (and JSON fallback) chat completions, usage, and
  cut-off rejection
- `prompt.ts` — form interview that asks one question at a time and writes an essay prompt from the user's answers
- `notes.ts` — Tavily search, counter-search, extract of full articles, structured notes
- `research.ts` — re-exports `notes.ts` for the Deno script
- `db.ts` — Flue sqlite adapter
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
  server ignores `stream`
- Send `max_completion_tokens`, not `max_tokens`. Request
  `stream_options.include_usage`. Do not send `user` until a tagged call
  confirms the spend-log field
- Send `response_format` only when the catalog lists it. Anthropic caches the
  notes prefix only (`cachedPrefix`). The instruction and draft are a second
  system block with no `cache_control`. Draft, expand, shorten, and revise pass
  catalog `supportedParams`
- The selected writer runs notes extraction, plan, draft, length fit, and
  critic. `--check-model` may override the critic only. There is no separate
  Flash Lite fact-check and no HaiMaker draft trio. Form default is Claude
  Sonnet 5. A missing writer key errors on the brief stage
- `finish_reason: "length"` throws `CutOffReply`. Callers must not use that
  content. A cut-off plan falls back to a title stub. A cut-off notes turn
  falls back to article excerpts. A cut-off draft fails the run. Expand,
  shorten, critic, and revise keep the current essay on cut-off. Critic
  `max_completion_tokens` is 2048 so the rubric JSON stays short
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
  only. Extract HTTP failure or empty extract uses search snippets so notes
  are not blank after a hit. Reach `noteFloor` before planning: 6 notes for
  500–1000 words, 8 through 2000, 10 above. Below the floor, `supplementResearch`
  re-queries, including the plan's gap list. Encyclopaedias and live blogs
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
  Introduction or Conclusion. Draft is one essay from that plan. Paraphrase;
  quoted words stay under 15% of the body. Cite `[n3]` after a figure, quote,
  or attributed claim. Name the outlet or author the first time, not in every
  sentence. Essays of 700 words or fewer are continuous prose. If the draft is
  under `essayLengthFloor`, one expand pass fills thin sections from notes
  already in the plan. If it is over `essayLengthCeiling`, one shorten pass
  cuts filler. Length is fitted again after critic revise. It does not weave
  unused notes or trim in code
- `cite.ts` rejects a figure or quote with no citation, a citation to a missing
  note, an 8-word phrase copied from an extracted article unless it is in
  quotation marks or has fewer than three distinctive words, and a quote share
  over 15%. A year in the brief is not a figure. The critic judges the eight
  RFC 0003 rubric items (claim, advance, objection, fidelity, voice, audience,
  takeaway, silence). The critic review and the harness merge; harness findings
  are not dropped when the critic also returns issues. After two revise
  passes,   leftover copied phrases are quoted in place only if that stays under
  the quote budget. The sidecar records only remaining issues. Leftover Layer
  1 problems block the save. Saving outside 85%–115% of the target fails.
  Save strips body links, URLs, and calls to action. A sentence that names
  "the notes", "the sources", or "this essay" is a harness fail. `## Sources`
  is built from cited note ids
- Style names still exist. They go into the draft prompt. There is no style
  rewrite pass
- Dry run prints config and does not call models or Tavily beyond the
  key-presence check
- Atomic write: `output/<slug>.md.tmp` then rename. The slug is the topic, not
  the plan title. The same slug gets `output/<slug>.notes.md` with attributed
  notes, the writer id, estimate, brief, plan, and critic
- Form `words` is an `ESSAY_LENGTHS` count and wins over a count in the topic.
  The CLI still uses `wordCountFromTopic`. `bodyWordCount` excludes the title,
  the `{n} words` line, and the Sources list
- The form interview uses the writer model. It asks one question at a time,
  including when the topic is empty, stops after five answers, and does not
  invent facts. A reply that describes how to write an essay is discarded. The
  topic it fills is still the only brief the pipeline receives
- The form stream yields notes after research, then plan, draft, critic, then
  the sidecar notes and the essay. Download names are `<slug>.md`,
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

- `src/agents/AGENTS.md` — Flue `Writer` agent, plus plan, one draft, and expand
- `skills/AGENTS.md` — style catalog used as draft wording guidance
