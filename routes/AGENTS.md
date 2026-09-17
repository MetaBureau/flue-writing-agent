# routes

## Purpose

Fresh screens for the writing test: prompt interview, topic, length, style, three writer radios, then the saved essay.

## Ownership

- `_app.tsx` sets the `flue` DaisyUI theme
- Routes import `define` from `define.ts`, which calls `createDefine` from `jsr:@fresh/core`
- `index.tsx` mounts the form island
- `api/write.ts` validates the form and streams `writeStages`
- `api/prompt.ts` runs the prompt interview on the writer model

## Local Contracts

- Styles are `STYLE_NAMES` from `src/skills/styles.ts`
- The page does not load the model hub. Writer radios are `WRITER_OPTIONS`. The form posts that option's provider and model, and does not post `checkModel`
- A model not in the chosen provider's `models` is HTTP 400 JSON `{ error }`
- Optional `checkModel` must be a HaiMaker picker id. The form does not send one, so the critic uses the writer. Without a writer key the run fails
- The stream yields `{ type: "error" }` if the essay body is outside 85%–115% of the request. Leftover harness problems after two revise passes save as a critic warning
- A write streams `text/event-stream`: stage events, `{ type: "piece", piece }`
  for notes, plan, draft, critic, and the essay, then
  `{ type: "essay", markdown, filename }`, or `{ type: "error" }`
- `/api/prompt` takes `provider`, `model`, `seed`, `turns`, and optional `force`. It returns `{ status: "ask", question }` or `{ status: "ready", prompt }`. An empty subject, unknown provider, or unknown model is HTTP 400 JSON `{ error }`. At most five answers. The prompt may use only what the user said

## Work Guidance

- Use DaisyUI component classes already included in `assets/styles.css`. Add a class to that include list before using a new component.
- Keep the theme in this app. Do not import the MetaBureau or StewMilne theme.

## Verification

`deno task dev` serves the page on port 5175.

## Child DOX Index

- `../islands/AGENTS.md` — client form that posts to `/api/write`
