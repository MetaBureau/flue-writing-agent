# routes

## Purpose

Fresh screens for the writing test: topic, style, provider, writer model, checker model, then the saved essay.

## Ownership

- `_app.tsx` sets the `flue` DaisyUI theme
- Routes import `define` from `define.ts`, which calls `createDefine` from `jsr:@fresh/core`
- `index.tsx` mounts the form island
- `api/write.ts` validates the form and streams `writeStages`

## Local Contracts

- Styles are `STYLE_NAMES` from `src/skills/styles.ts`
- Providers are the keys of `PROVIDERS`. Picker ids stay in each provider's `models`. HaiMaker labels, prices, and the reasoning flag come from the model hub when that fetch succeeds
- If the HaiMaker key's model list shares no picker id, the picker is empty and the form shows a warning. Do not show the curated list in that case
- A model not in the chosen provider's `models` is HTTP 400 JSON `{ error }`
- `checkModel` must be a HaiMaker picker id. The route passes it to `writeStages`. The checker uses `HAIMAKER_API_KEY` even when the writer is Mercury. Without that key, fact-check is skipped and the essay is still saved. A checker auth or rate-limit error yields the essay, then a fact-check error
- A missing topic or unknown style is HTTP 400 JSON `{ error }`
- A write streams `text/event-stream`: stage events, then `{ type: "essay", markdown }`, or `{ type: "error" }`

## Work Guidance

- Use DaisyUI component classes already included in `assets/styles.css`. Add a class to that include list before using a new component.
- Keep the theme in this app. Do not import the MetaBureau or StewMilne theme.

## Verification

`deno task dev` serves the page on port 5175.

## Child DOX Index

- `../islands/AGENTS.md` — client form that posts to `/api/write`
