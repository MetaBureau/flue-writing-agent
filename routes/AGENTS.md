# routes

## Purpose

Fresh UI on Deno (dev port 5175, host Deno Deploy). Interview, then write.

## Ownership

- `_app.tsx` — `flue` DaisyUI theme
- `index.tsx` — form island
- `api/write.ts` — validates the form, calls `writeWithFlue`, streams pieces
- `api/prompt.ts` — prompt interview on the writer model

## Local Contracts

- Styles are `STYLE_NAMES`. Writer radios are `WRITER_OPTIONS`. Default Claude
  Sonnet 5. No `checkModel` from the form. `writeWithFlue` still uses Gemini
  3.5 Flash as the critic unless the API passes `checkModel`
- Unknown provider/model is HTTP 400 JSON `{ error }`
- Stream is `text/event-stream`. First bytes are a 2KB comment pad, then Brief
  active with Writer running, then `: ping` heartbeats each poll tick. Headers
  disable proxy buffering. `/api/write` reserves `outputPath`, passes it to
  `writeWithFlue` with the request abort signal, and polls the job sidecar
  (Deno KV, then `job.json`) to emit
  notes/plan/draft/critic when those fields exist. Stream `cancel` and
  `ctx.req.signal` abort the Flue run. A cancelled run is a clean close, not a
  writer-failed event, and does not recover-save an essay. Skipped research is a
  warning. A Tavily HTTP failure (`job.researchError`) is a research warning
  with that reason, not a silent 0 notes. Then `{ type: "essay", markdown, filename }` using the saved slug,
  which may be `<slug>-2` when the first path is taken
- `/api/prompt` is unchanged: one question at a time, at most five answers

## Work Guidance

- DaisyUI classes already in `assets/styles.css`
- Keep this app's theme

## Verification

`deno task dev` on port 5175. Production is `deno task build` then
`deno task serve` (`_fresh/server.js`). CI proves that boot with `deno task smoke`.

## Child DOX Index

- `../islands/AGENTS.md` — client form
