# tests

## Purpose

Deterministic checks for pipeline helpers and prompt contracts. No live model or Tavily calls.

## Ownership

`pipeline_test.ts` is the current suite. It imports `src/main.ts`, `src/agents/write.ts`, `src/skills/editorial.ts`, `src/research.ts`, `src/complete.ts`, `src/catalog.ts`, `src/factcheck.ts`, `src/brief.ts`, `src/contract.ts`, and `src/prompt.ts`.

## Local Contracts

- Run with `deno task test` (`deno test --allow-read --allow-write tests/`)
- Assert prompt wording that encodes notes as the source for specifics (argument
  and general knowledge allowed; invented statistics, quotes, and sources
  forbidden), the frog brief verbatim in every stage prompt, the precedence
  sentence, the requested word count, synthesis helpers, the Mercury
  synthesis token cap, and the style keep rule for a finished cut versus a stub
- Assert prose rejection, paragraph repeat ratio, source-page note drops, essay markdown without a style line, the body word count line, `stripBodyLinks`, `dropCallsToAction`, and `isCallToAction` (ordinary sentences stay; shop phrases go; Sources links stay), cleanup before `essayReadyToSave`'s length check, a leftover body link forcing `briefMustRevise`, a measured length that cannot force a revision, the 115% ceiling trim that keeps the close, `researchQuery` including the claim, brief-check fail rules including amusement as actual wit, fact-check claim numbers and batch caps, fact-check citations outside the flags, `not-a-claim` skipped by `applyFactCheck`, brief-check JSON parse, a checker that may match the writer and must differ from a drafter, checker replacement notes, the unchecked notes record, piece download names, the form length list, the 85% length floor excluding Sources, the prompt interview contract, and the Anthropic cache split
- Research tests must keep ignoring a synthesized `answer` field, ignoring raw page bodies, and dropping empty bodies and furniture sentences

## Work Guidance

- Prefer adding cases to `pipeline_test.ts` until a second module has its own durable boundary
- Do not require network or API keys in tests

## Verification

`deno task test` is the verification for this subtree.

## Child DOX Index

None.
