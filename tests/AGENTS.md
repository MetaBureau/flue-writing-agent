# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/cite.ts`, `src/critic.ts`, `src/research.ts`, `src/complete.ts`, `src/catalog.ts`, `src/brief.ts`, `src/contract.ts`, and `src/prompt.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --allow-read --allow-write tests/`)
- Assert attributed notes keep outlet, URL, stance, and quotes; draft prompts
  cite `[n3]` and do not say to weave unused notes; the critic prompt carries
  the eight RFC 0003 rubric items and does not invent a wit rule; the frog
  brief is verbatim in stage prompts
- Assert the citation harness rejects an uncited figure or quote and a missing
  note id, does not require a cite for a year the notes do not mention, and
  does not require a cite for a year that appears in the brief; the
  copy harness rejects an 8-word shared phrase with three distinctive words
  unless it is quoted; wrapping leftover copied phrases in quotes clears the
  harness when that stays under a 15% quote budget; a literature-review quote
  share fails
- Assert research ignores a synthesized `answer` and search `raw_content`,
  extracts full article text, falls back to search snippets, drops Facebook,
  content farms, and title mirrors, matches outlet to the URL domain, and
  includes a counter query
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

`deno task test` is the verification for this subtree.

## Child DOX Index

None.
