# routes

## Purpose

Fresh screens for the writing test: topic, style, provider, model, then the saved essay.

## Ownership

- `_app.tsx` sets the `flue` DaisyUI theme
- Routes import `define` from `define.ts`, which calls `createDefine` from `jsr:@fresh/core`
- `index.tsx` mounts the form island
- `api/write.ts` validates the form and streams `writeStages`

## Local Contracts

- Styles are `STYLE_NAMES` from `src/skills/styles.ts`
- Providers are the keys of `PROVIDERS`; models are each provider's `models`
- A model not in the chosen provider's `models` is HTTP 400 JSON `{ error }`
- A missing topic or unknown style is HTTP 400 JSON `{ error }`
- A write streams `text/event-stream`: stage events, then `{ type: "essay", markdown }`, or `{ type: "error" }`

## Work Guidance

- Use DaisyUI component classes already included in `assets/styles.css`. Add a class to that include list before using a new component.
- Keep the theme in this app. Do not import the MetaBureau or StewMilne theme.

## Verification

`deno task dev` serves the page on port 5175.

## Child DOX Index

- `../islands/AGENTS.md` — client form that posts to `/api/write`
