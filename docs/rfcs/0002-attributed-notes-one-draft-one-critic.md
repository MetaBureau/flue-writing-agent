# RFC 0002: Attributed notes, one draft, one critic

- Status: Implemented
- Date: 2026-09-17
- Author: Stew Milne
- Scope: `src/notes.ts`, `src/cite.ts`, `src/critic.ts`, `src/agents/write.ts`, `src/brief.ts`, `src/workflow.ts`, `src/main.ts`, `src/contract.ts`, `src/skills/`, `tests/pipeline_test.ts`

## Summary

The old pipeline mixed unattributed snippets, then rewrote the essay up to 12 times. Provenance was gone before drafting, so models could not keep who said what, what a source argued, or how old a fact was.

This RFC replaces that chain with three moves.

1. Search, drop duplicates and weak hosts, extract the top articles in full, and keep structured notes with id, URL, author, outlet, date, stance, and quotes.
2. Plan, then write one draft, then fit length with one expand if short and one shorten if long. Do not merge three drafts, weave leftover snippets, or trim sentences in code.
3. One critic that sees the brief, the notes, and the cited draft, plus a harness that rejects uncited figures, missing note ids, unquoted copying, and a quote share over 15%. Merge critic and harness issues. After two revise passes, leftover copied phrases are quoted in place only under the quote budget. Leftover harness problems save as a warning.

RFC 0001 recorded the publishing-stage map that led here. This RFC is the runtime contract.

## Pipeline

`brief → research (search, counter-search, extract with snippet fallback) → notes → plan → draft → fit length → critic + harness → revise (second pass if leftover) → save`

Typical model calls are notes, plan, draft, and critic, plus Tavily. Brief parse stays as a small extra call. Expand and revise run only when needed.

## Non-goals

- A separate Flash Lite fact-check
- A wit rule that is not in the brief
- Restoring `writerFacts`, weave, or `capEssayLength`
