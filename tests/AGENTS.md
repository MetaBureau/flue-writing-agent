# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/skills/editorial.ts`, `src/research.ts`, `src/complete.ts`, and `src/catalog.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --allow-read --allow-write tests/`)
- Assert prompt wording that encodes notes-only rules, and the style keep rule for a finished cut versus a stub
- Research tests must keep ignoring a synthesized `answer` field, ignoring raw page bodies, and dropping empty bodies and furniture sentences

## Work Guidance

- Prefer adding cases to `pipeline_test.ts` until a second module has its own durable boundary
- Do not require network or API keys in tests

## Verification

`deno task test` is the verification for this subtree.

## Child DOX Index

None.
