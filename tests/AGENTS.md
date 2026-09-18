# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/agents/run.ts`, `src/cite.ts`, `src/critic.ts`, `src/research.ts`, `src/complete.ts`, `src/catalog.ts`, `src/brief.ts`, `src/contract.ts`, `src/prompt.ts`, and `src/essay_kv.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --unstable-kv --allow-read --allow-write --allow-env tests/`)
- Assert attributed notes keep outlet, URL, stance, and quotes; draft prompts
  cite `[n3]` and do not say to weave unused notes; the critic prompt carries
  the eight RFC 0003 rubric items, judges as the intended reader, takes an
  objection from a competent reader when notes are empty, and treats a missing
  operational bound as an advance fail on architecture briefs, fails a sibling
  failure mode or a menu of policies, and receives the plan so a swapped bound
  fails; the sidecar is the editorial assessment with rewrite notes; a swapped
  plan bound is leftover and fails advance even when the critic JSON would
  pass; a matching bound, or a plan that named none, is clean; a menu of
  policies is leftover; `leftoverSaveError` names that leftover; research
  below `noteFloor` returns `researchFloorMessage` and does not plan; a
  floor or plan-bound error string is not a recoverable essay; architecture
  or implementation briefs `researchRequired`, amusement briefs do not;
  `RunMeter.from` restores a snapshot; a run abort cancels `runFetchSignal`;
  `unusedEssayPath` skips a stem that exists only in Deno KV;
  `onDeploy` is true when `DENO_DEPLOYMENT_ID` is set; `flueSqliteFile` is
  `/tmp/flue.db` on Deploy;
  SSE padding is at least 2KB; a cancelled-run string is not a recoverable
  essay; a second `start()` in one process is treated as already booted; it does
  not invent a wit rule; the frog brief is verbatim in stage prompts
- Assert the default critic is Gemini 3.5 Flash and is never the writer model
- Assert the citation harness rejects an uncited figure or quote when notes
  exist, and a missing note id, does not require a cite for a year the notes
  do not mention, and does not require a cite for a year that appears in the
  brief, and does not require sources or quotes when notes are empty; the
  copy harness rejects an 8-word shared phrase with three distinctive words
  unless it is quoted; wrapping   leftover copied phrases in quotes clears the
  harness when that stays under a 15% quote budget; a literature-review quote
  share fails; a sentence that names "the notes", "the sources", or
  "this essay does not / cannot" fails, while "the claim this essay advances"
  does not; leftover critic issues whose passage is still in the essay stay
  for a second revise; unknown `[nX]` fails even when notes are empty and is
  stripped after revise; truncated critic JSON still yields parsed items;
  HTML and PDF of one report on the same publisher
  count as one source; a chat-length essay is recoverable for save and a
  length miss still produces markdown; plan note ids that are not in the notes
  are dropped; an existing essay path is not overwritten
- Assert research ignores a synthesized `answer` and search `raw_content`,
  extracts full article text, falls back to search snippets, drops Facebook,
  content farms, title mirrors, and same-publisher HTML/PDF twins, matches
  outlet to the URL domain, and includes a counter query
- Assert a 500-word plan keeps at most three sections and strips Introduction
  and Conclusion labels; a brief without a claim asks the plan to propose one;
  a brief without a purpose defaults to persuading the audience
- Assert essay markdown without a style line, the body word count line, CTA and
  URL stripping, Sources links kept, save length 85%–115% as an error outside
  that range, form radios, and the Anthropic cache split

## Work Guidance

- Prefer adding cases to `pipeline_test.ts` until a second module has its own durable boundary
- Do not require network or API keys in tests

## Verification

`deno task test` is the verification for this subtree. CI runs it as part of
`deno task ci`, then builds and smokes `_fresh/server.js`.

## Child DOX Index

None.
