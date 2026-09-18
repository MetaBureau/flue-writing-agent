# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits
- Source: https://github.com/agent0ai/dox

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## This Project

**North star: Flue.** Writing is a Flue agent (`Writer`) driven by a Flue workflow: a program that `init`s, `dispatch`es, and `read`s. Canonical: [Flue Workflows](https://flueframework.com/docs/guide/workflows/). Local CLI is `flue run`. In-process is `start()` / `init()` / `dispatch()` / `read()` in `src/agents/run.ts`. Do not invent another meaning of workflow. Do not sequence the essay as `streamChat` in `src/workflow.ts`.

**Environment: Deno Fresh and Deno Deploy.** The UI is Fresh (`deno task dev`, port 5175). Production host is Deno Deploy. Import Fresh from `jsr:@fresh/core`. Keep `"workspace": []` in `deno.json`. Do not retarget Flue to Cloudflare for this product.

`/api/write`, `deno task start`, and `deno task eval` drive `Writer` through `src/agents/run.ts`. Publishing RFCs in `docs/rfcs/` name editorial quality (notes, claim, critic). Those are agent/tool contracts, not a second orchestrator.

- UI: Fresh on port 5175. Keep that port. Deploy that same app to Deno Deploy.
  Fresh production is `deno task build` then `deno task serve` (`_fresh/server.js`).
  The Deploy app uses the Fresh preset. CLI stays `deno task start` (alias
  `deno task write`).
- Essays persist in Deno KV (chunked `.md`, `.notes.md`, `.job.json`). Local
  CLI also writes `output/`. On Deploy, attach a KV database. `DENO_DEPLOYMENT_ID`
  selects the attached KV; `ESSAY_KV_PATH` is the local file (`data/essays.kv`
  by default). Unset `ESSAY_KV_PATH` on Deploy. Flue sqlite is `/tmp/flue.db`
  on Deploy and `./data/flue.db` on the CLI.
- `deno.json` sets `"workspace": []` so Fresh boots here without joining the parent MetaBureau workspace. Do not remove that field.
- Import Fresh from `jsr:@fresh/core`. The bare specifier `fresh` resolves to an unrelated npm package under Vite.
- Fresh production is Vite 7 (`deno run -A npm:vite@7.3.6`). Do not run PATH `vite` (that binary is 8 via `@flue/cli`); Rolldown cannot resolve `fresh/runtime-client`.
- `deno install` needs `--minimum-dependency-age=0` while `package.json` depends on a recently published `@flue/cli`.
- Flue workflow: `npx flue run src/agents/writer.ts` or `writeWithFlue` in `src/agents/run.ts`. Fresh `/api/write` and `deno task eval` use that. `AgentRunError` on a failed `read()`. `Writer.durability` is 3 attempts and 30 minutes wall clock. Dropping the `/api/write` stream, or starting a new write, aborts Flue (`agent.abort()`) and in-flight writer/Tavily HTTP. A cancelled run does not persist a recovered essay.
- CLI: `deno task start "<topic>"` (or `deno task write`) calls `writeWithFlue`. SIGINT, SIGTERM, and the 30-minute wall clock abort that run. `src/workflow.ts` is leftover. Do not add stages there.
- Eval: `deno task eval` runs the four RFC 0003 briefs to `evals/out/`
- CI: `.github/workflows/ci.yml` runs `deno task ci` (test, lint, build, smoke).
  Smoke boots `_fresh/server.js` and GETs `/` plus the client CSS. It does not
  POST `/api/write` or call models.
- Stack: Flue agent + Fresh on Deno. Tavily for notes. HaiMaker/Mercury via Writer providers.
- Length defaults to 900 words. The form select is the page length and overrides a count in the topic. Options are 500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, and 5000. The CLI still reads a count from the topic (`200 words`). The saved essay must be at least 85% of that count and at most 115%, excluding the Sources list. A miss is an error, not a silent trim. The body word count is written under the title.
- The form interview asks one question at a time, using the writer model, and fills the topic from that prompt. That topic is the brief. `parseBrief` reads audience, purpose, tone, claim, and constraints once. The verbatim text governs later stages. Where a stage rule conflicts with the brief, follow the brief. Never invent statistics, studies, quotes, or sources. Do not paste a call to action or a URL into the essay body. Research is optional: call it when the brief needs facts a reader can check; skip it for humour, opinion, or known practice. Architecture or implementation of a named system requires research and the source floor. When research runs, it searches the subject plus the claim, and a counter-search, not the writing instruction, and it must reach the source floor before planning: 6 notes for 500–1000 words, 8 through 2000, 10 above. Sources and quotations are not required on every essay. Length stays on the length select
- When the form or `--model` sets a model, that model runs notes extraction, plan, draft, and length fit. Writer calls `research` if needed, `draft`, then `save_essay`. `save_essay` critiques. Do not free-write the essay in chat. The critic is Gemini 3.5 Flash (`google/gemini-3.5-flash`) unless `--check-model` or `CHECK_MODEL` sets another HaiMaker id. If that id is the writer, the other of Sonnet 5 and Gemini 3.5 Flash is used. There is no three-draft merge, weave loop, style rewrite, brief-check wit rule, or Flash Lite fact-check
- Notes are structured from full extracted articles. Extract failure or empty extract falls back to search snippets. A Tavily HTTP failure (401, 429, 432 key usage cap) is stored on the job and shown; it is not silent 0 sources. A 401, 403, 429, or 432 is terminal for search: do not re-query that key. Still draft from the brief. Each note keeps id, URL, author, outlet, date, stance, and quoted claims. The outlet must match the URL's domain; a brand mentioned on the page does not replace it. Content farms are blocked with essay mills and social hosts. Writers see those notes with attribution. When research runs, it must reach the source floor before planning: 6 notes for 500–1000 words, 8 through 2000, 10 above. Below the floor, re-query with the search pair, then a probe plan's gap list, unless Tavily already returned HTTP 401, 403, 429, or 432. Still below the floor, `research` still plans and `draft` still writes. An encyclopaedia or live blog counts toward the floor but cannot be the only support for a section. Research dedupes by URL, title, and same-publisher similar title. When notes exist, the draft cites `[n3]`. Paraphrase; quoted words stay under 15% of the body. Sources and quotations are optional unless the essay uses a figure, a quotation, or a sourced claim. The harness rejects an uncited figure or quote when notes exist, a missing note id, unquoted copying of an 8-word phrase that has at least three distinctive words, a quote share over 15%, and a sentence that names "the notes", "the sources", or "this essay" with does not / cannot / will not / is unable. "The claim this essay advances" is not a process sentence. A year used as the essay's timeframe, or a year in the brief, is not a figure. After two revise passes, leftover copy is quoted in place only if that stays under the quote budget. The second revise includes leftover critic passages still in the essay plus leftover harness findings. Leftover Layer 1, length, or `planBoundProblems` leftover still write the `.md` and record the error on the job unless `keepOnFail`. The critic judges the eight RFC 0003 rubric items as the brief's intended reader and receives the plan. On architecture or implementation briefs, a mechanism without an operational bound (overflow, conflict, aging, or failure) fails advance; a timeout or fail-open policy does not cover overflow; a menu of policies does not pass; if the plan named a bound, answering a different failure mode fails. `planBoundProblems` is leftover for that swap; `applyPlanBounds` fails advance even if the critic model passed. With empty notes, objection is the counter a competent reader would raise. `runCritique` calls `revisePassages` on the writer model, then fits length, and `save_essay` persists that draft. `draft` writes the essay from the job brief, plan, and notes, then fits length. `save_essay` drafts if that step was skipped. The critic sidecar is the editorial assessment. `save_essay` critiques if the agent skipped that loop. Plan at most three sections at 500–700 words, four through 1500, five through 2500, six above that. Do not label sections Introduction or Conclusion. A brief without a claim gets one from the plan; a brief without a purpose defaults to persuading the audience of the claim. Short essays are continuous prose, not a heading per paragraph. Opening, close, and body may add argument, interpretation, examples, transitions, and widely known general knowledge. Do not invent statistics, studies, quotes, or sources. Do not present a weak source such as a forum post or a TIL as research. Do not write a sentence about the notes, the sources as a set, the research, or the essay itself.
- `output/` is generated; do not hand-edit it as source. Vite ignores `output/` so saving an essay does not reload the form. A new run never overwrites an existing `.md` on disk or in KV; it writes `<slug>-2.md` instead. Deno Deploy stores the essay in KV. The local CLI still leaves the files.
- Root `write.ts` is a HaiMaker scratch script. The agent is `src/agents/writer.ts`. Helpers live in `src/agents/write.ts`.
- `HAIMAKER.md` and `Mercury2.5_economist.md` are operator notes / sample output, not runtime

## User Preferences

- Never commit live API keys. `.env` is gitignored. `.env.example` is the public template; keep placeholders there, not secrets
- Flue is the north star. Fresh and Deno Deploy are the environment. Do not add writing stages to `src/workflow.ts`. Do not retarget this app to Cloudflare.
- Keep the notes-only pipeline: Tavily must not feed a synthesized answer into notes
- Essays live in Deno KV on Deploy. Local CLI dual-writes `output/`
- Public marketing copy in the parent MetaBureau site is out of scope here

## Child DOX Index

- `docs/AGENTS.md` — publishing RFCs
- `routes/AGENTS.md` — Fresh page and `/api/write`
- `src/AGENTS.md` — providers, notes, cite, leftover `workflow.ts`
- `tests/AGENTS.md` — Deno tests for prompts and harnesses
- `evals/AGENTS.md` — RFC 0003 briefs and runner

Root keeps `README.md`, `WRITE.md`, `deno.json`, `deno.lock`, `.env.example`, `.gitignore`, `define.ts`, `main.ts`, `client.ts`, `vite.config.ts`, `assets/styles.css`, root `write.ts`, `.github/workflows/ci.yml`, `scripts/smoke.ts`, and sample markdown. `WRITE.md` is the paste-in prompt for a local AI to commission an essay with `deno task start`.
