# evals

## Purpose

Frozen RFC 0003 briefs and the runner that scores them.

## Ownership

- `briefs/` — four committed briefs; change only by RFC
- `briefs.ts` — ids, word counts, and verbatim text
- `score.ts` — Layer 1 invariants and the printed table
- `run.ts` — `deno task eval`; writes essays and sidecars under `evals/out/`
- `out/` — generated; do not commit

## Local Contracts

- Writer is Claude Sonnet 5
- Layer 1 is scored mechanically; Layer 2 uses the pipeline critic
- The table columns are brief, word count, quoted %, notes cited, the seven invariants, the eight rubric items, cost
- Do not retire a brief because it fails

## Work Guidance

Run `deno task eval` after a quality change. Fix only what the table fails.

## Verification

`deno task eval` prints the table. All four briefs must pass every invariant and rubric item.

## Child DOX Index

None.
