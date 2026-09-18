# src/agents

## Purpose

`Writer` is the Flue agent. `run.ts` is the in-process workflow:
`start` / `init` / `dispatch` / `read`.

## Ownership

- `writer.ts` — `'use agent'`. Tools: `research`, `draft`, `critique`,
  `save_essay`. `draft` writes from the job brief, plan, and notes, then fits
  length. `critique` runs `revisePassages` on the writer model. HaiMaker
  (Sonnet 5 writer, Gemini 3.5 Flash critic, Flash Lite) and Mercury. Job
  sidecar next to the `.md`.
- `run.ts` — `writeWithFlue`. Boots sqlite (`./data/flue.db`, or `/tmp/flue.db`
  on Deploy), dispatches `Writer`, returns the job. Essay files also go to Deno
  KV through `writeOutputFile`.
- `write.ts` — plan/draft/expand/shorten helpers and notes extraction. Not the run.

## Local Contracts

- `writeWithFlue` takes topic, style, provider, model, checkModel, words, outDir,
  outputPath, keepOnFail, signal.
  After `read()`, it returns a saved job, or persists a recovered draft from
  critique / the chat reply. It does not throw the essay text as the error.
  It does not overwrite an existing `.md` on disk or in Deno KV; it picks
  `<slug>-2.md` and up.
  Pass `outputPath` when the caller already reserved the file. Pass `signal` to
  abort: `agent.abort()`, cancel `read()`, and skip recovery persist unless the
  `.md` is already on disk. `start()` is a no-op when this process already has
  a Flue runtime (Vite HMR). The critic defaults to Gemini 3.5 Flash.
  `checkModel` / `CHECK_MODEL` overrides it. It is never the writer model.
- Writer is a dispatcher: `research` if needed, `draft`, `save_essay`.
  `save_essay` critiques. Do not free-write the essay in chat.
- `research` is optional except when `researchRequired` (architecture or
  implementation, or explain a named system). Call it when the brief needs
  checkable evidence. When it runs, it extracts notes and re-queries below
  the floor. It plans only after `noteFloor`. Below the floor it writes the
  notes on the job and returns `researchFloorMessage`. Skip it for humour,
  opinion, or known practice. `draft` writes from the brief alone when
  research was skipped and not required.
- Tools share one `RunMeter` on `job.usage`. `formatRun` uses catalog prices.
- `draft` writes one essay from the job brief, plan, and notes, then one
  expand or shorten pass. `save_essay` calls it when the job has no draft.
  A chat stub under 80 words does not replace that draft.
- Sources and quotations are optional unless the essay uses a figure, a
  quotation, or a sourced claim. Never invent statistics, studies, quotes, or
  sources.
- `critique` stores the draft on the job, then runs the RFC 0003 rubric plus the
  cite harness and `planBoundProblems`, with the plan in the critic prompt.
  `applyPlanBounds` fails advance when leftover names a swapped or missing
  plan bound, even if the critic model passed. Objection uses notes when
  present, otherwise a competent reader of the brief. Architecture or
  implementation briefs fail advance when a mechanism has no operational bound,
  when the bound is a sibling failure mode, when the bound is a menu of
  options, or when the essay answers a different bound than the plan named.
  Open issues run `revisePassages` on the writer model, then length fit. The
  tool is for `save_essay`. `save_essay` runs critique first when none has run,
  or when the markdown changed and there has been only one critique. It persists
  the rewritten draft, not the pre-critique markdown. Open issues hold the save
  until a second critique. After two critiques it writes the `.md`. A leftover
  plan bound is a save error unless `keepOnFail`, same as length. The critic
  sidecar is the editorial assessment.
- `save_essay` always writes the `.md` once that gate passes, then reports
  length / Layer 1 / plan-bound leftover problems unless `keepOnFail`
- Tool `run` bodies stay at module scope (Deno lint / hooks)

## Work Guidance

- Change prompts and the cite harness together
- Do not sequence the essay in `src/workflow.ts`

## Verification

`deno task test` covers helpers. Live `flue run` / form / eval need keys.
`deno task ci` must emit `_fresh/server.js` and pass smoke before Deploy.

## Child DOX Index

None.
