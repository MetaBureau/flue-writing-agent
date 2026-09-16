# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/skills/editorial.ts`, and `src/research.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --allow-read --allow-write tests/`)
- Assert prompt wording that encodes notes-only and no-shorten rules, not just function names
- Research tests must keep ignoring a synthesized `answer` field and dropping empty bodies

## Work Guidance

- Prefer adding cases to `pipeline_test.ts` until a second module has its own durable boundary
- Do not require network or API keys in tests

## Verification

`deno task test` is the verification for this subtree.

## Child DOX Index

None.
