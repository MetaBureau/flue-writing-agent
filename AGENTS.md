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

Deno Fresh UI plus a Flue agent. `deno task dev` serves the form on port 5175. The form can interview the user and fill the topic from that prompt, then posts topic, length, style, provider, model, and checker model to `/api/write`. That route streams stage events, then notes, each draft, synthesis, and the essay as viewable pieces, then the essay markdown. The page opens each piece in a modal and downloads it as `.md`.

- UI: `deno task dev` on port 5175. Keep that port.
- `deno.json` sets `"workspace": []` so Fresh boots here without joining the parent MetaBureau workspace. Do not remove that field.
- Import Fresh from `jsr:@fresh/core`. The bare specifier `fresh` resolves to an unrelated npm package under Vite.
- `deno install` needs `--minimum-dependency-age=0` while `package.json` depends on a recently published `@flue/cli`.
- CLI entry: `src/main.ts` via `deno task start "<topic>"`
- Stack: Deno, OpenAI-compatible `/chat/completions`, optional Tavily
- Length defaults to 900 words. The form select is the page length and overrides a count in the topic. Options are 500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, and 5000. The CLI still reads a count from the topic (`200 words`). The saved essay must be at least 85% of that count, excluding the Sources list. The body word count is written under the title. A shorter piece is an error, not a successful save.
- The form interview asks one question at a time, using the writer model, and fills the topic from the user's answers. It does not research and does not invent facts. Length stays on the length select
- When the form or `--model` sets a model, that model runs outline, extend, and style. Drafts use the HaiMaker trio (`anthropic/claude-haiku-4-5`, `mistralai/mistral-large-2512`, `moonshotai/kimi-k2-0905`) when `HAIMAKER_API_KEY` is set, else the writer. Synthesis uses Mercury 2.5 when a Mercury key is set, else the writer. Mercury synthesis sends `SYNTHESIS_MAX_TOKENS` (65,536) so reasoning does not cut off the merge. A longest-draft fallback is a warning, not a normal finish. Fact-check uses a separate HaiMaker model (`CHECK_MODEL`, default `openai/gpt-4.1`). Without `HAIMAKER_API_KEY`, fact-check is skipped and the essay is still saved. Without a writer override, fast and reasoning env vars can still differ
- Notes are the source for specific facts, figures, quotes, and named studies. Opening, close, and body may add argument, interpretation, examples, transitions, and widely known general knowledge. The checker marks those `not-a-claim` and `applyFactCheck` skips them. Do not invent statistics, studies, quotes, or sources. Do not present a weak source such as a forum post or a TIL as research
- `output/` is generated; do not hand-edit it as source. Vite ignores `output/` so saving an essay does not reload the form
- Root `write.ts` is a HaiMaker scratch script; the product writer is `src/agents/write.ts`
- `HAIMAKER.md` and `Mercury2.5_economist.md` are operator notes / sample output, not runtime

## User Preferences

- Never commit live API keys. `.env` is gitignored. `.env.example` is the public template; keep placeholders there, not secrets
- Prefer `deno task` from this repo root (`start`, `dev`, `test`)
- Keep the notes-only pipeline: Tavily must not feed a synthesized answer into notes
- Public marketing copy in the parent MetaBureau site is out of scope here

## Child DOX Index

- `docs/AGENTS.md` — RFCs for workflow design
- `routes/AGENTS.md` — Fresh page and `/api/write`
- `src/AGENTS.md` — CLI entry, providers, streaming completion, Tavily research
- `tests/AGENTS.md` — Deno tests for prompts, notes grounding, and research parsing

Root keeps `README.md`, `deno.json`, `deno.lock`, `.env.example`, `.gitignore`, `define.ts`, `main.ts`, `client.ts`, `vite.config.ts`, `assets/styles.css`, root `write.ts`, and sample markdown.
