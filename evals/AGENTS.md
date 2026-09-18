# evals

## Purpose

Frozen RFC 0003 briefs and the runner that scores them.

## Ownership

- `briefs/` — four committed briefs; change only by RFC
- `briefs.ts` — ids, word counts, verbatim text
- `score.ts` — Layer 1 plus the critic rubric table
- `run.ts` — `deno task eval`; calls `writeWithFlue`; writes `evals/out/` and Deno KV
- `out/` — generated; do not commit

## Local Contracts

- Writer is Claude Sonnet 5 via `writeWithFlue`
- Critic is Gemini 3.5 Flash unless `CHECK_MODEL` is set
- Layer 1 is mechanical; Layer 2 is the agent critic sidecar. A leftover
  plan bound fails advance even when `keepOnFail` writes the file
- Do not retire a brief because it fails

## Work Guidance

Run `deno task eval` after a quality change. Fix only what the table fails.

## Verification

`deno task eval` prints the table. All four briefs must pass.

## Child DOX Index

None.
