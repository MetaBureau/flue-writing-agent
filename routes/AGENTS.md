# routes

## Purpose

Fresh screens for the writing test: prompt interview, topic, length, style, provider, writer model, checker model, then the saved essay.

## Ownership

- `_app.tsx` sets the `flue` DaisyUI theme
- Routes import `define` from `define.ts`, which calls `createDefine` from `jsr:@fresh/core`
- `index.tsx` mounts the form island
- `api/write.ts` validates the form and streams `writeStages`
- `api/prompt.ts` runs the prompt interview on the writer model

## Local Contracts

- Styles are `STYLE_NAMES` from `src/skills/styles.ts`
- Providers are the keys of `PROVIDERS`. Picker ids stay in each provider's `models`. HaiMaker labels, prices, and the reasoning flag come from the model hub when that fetch succeeds
- If the HaiMaker key's model list shares no picker id, the picker is empty and the form shows a warning. Do not show the curated list in that case
- A model not in the chosen provider's `models` is HTTP 400 JSON `{ error }`
- `checkModel` must be a HaiMaker picker id. The route passes it to `writeStages`. The checker uses `HAIMAKER_API_KEY` even when the writer is Mercury. Without that key, fact-check is skipped and the essay is still saved. A checker auth or rate-limit error yields the essay, then a fact-check error
- A missing topic, unknown style, or length outside `ESSAY_LENGTHS` is HTTP 400 JSON `{ error }`. An omitted length is 900. The route passes `words` to `writeStages`, and that count overrides a count in the topic. The stream yields `{ type: "error" }` if the essay body is below `essayLengthFloor`
- A write streams `text/event-stream`: stage events, `{ type: "piece", piece }` for notes, each draft, and the essay, then `{ type: "essay", markdown, filename }`, or `{ type: "error" }`
- `/api/prompt` takes `provider`, `model`, `seed`, `turns`, and optional `force`. It returns `{ status: "ask", question }` or `{ status: "ready", prompt }`. An empty subject, unknown provider, or unknown model is HTTP 400 JSON `{ error }`. At most five answers. The prompt may use only what the user said

## Work Guidance

- Use DaisyUI component classes already included in `assets/styles.css`. Add a class to that include list before using a new component.
- Keep the theme in this app. Do not import the MetaBureau or StewMilne theme.

## Verification

`deno task dev` serves the page on port 5175.

## Child DOX Index

- `../islands/AGENTS.md` — client form that posts to `/api/write`
