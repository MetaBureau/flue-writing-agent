# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/skills/editorial.ts`, `src/research.ts`, `src/complete.ts`, `src/catalog.ts`, `src/factcheck.ts`, `src/contract.ts`, and `src/prompt.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --allow-read --allow-write tests/`)
- Assert prompt wording that encodes notes-only rules, the requested word count, and the style keep rule for a finished cut versus a stub
- Assert prose rejection, paragraph repeat ratio, source-page note drops, essay markdown without a style line, fact-check citations outside the flags, checker replacement notes, the unchecked notes record, piece download names, the form length list, the 85% length floor, the prompt interview contract, and the Anthropic cache split
- Research tests must keep ignoring a synthesized `answer` field, ignoring raw page bodies, and dropping empty bodies and furniture sentences

## Work Guidance

- Prefer adding cases to `pipeline_test.ts` until a second module has its own durable boundary
- Do not require network or API keys in tests

## Verification

`deno task test` is the verification for this subtree.

## Child DOX Index

None.
