# islands

## Purpose

Client form for a writing test. It does not call models itself.

## Ownership

`WriteForm.tsx` owns the prompt interview, topic, length, style, provider, writer model, and checker fields, the stage widget, and the document modals.

## Local Contracts

- Read the event stream from `/api/write`
- Post the prompt interview to `/api/prompt`. An empty topic still starts the interview with `PROMPT_OPENING`. Show one question at a time. `Use this prompt` writes the reply into the topic. Do not call a model from the island
- Mark each `WRITE_STAGES` entry active, done, or error
- Show `error` in an alert. Keep notes, each draft, and the essay as pieces. View opens a DaisyUI `modal`. Download writes that piece as `.md` using the piece filename. Do not dump the essay on the page.
- Length options are `ESSAY_LENGTHS` from `src/contract.ts`, default 900. Post the chosen count as `words`. Do not read length from the topic on this form. A run below 85% of that count shows as an error
- Style, provider, writer model, and checker options come from the route, not a second catalog. The checker list is the HaiMaker picker, defaulting to `openai/gpt-4.1`
- Changing provider resets the model to that provider's first model

## Work Guidance

Use DaisyUI 5 classes already included in `assets/styles.css`: `card`, `label`, `textarea`, `select`, `btn`, `alert`, `loading`, `steps`, `modal`, `chat`.

## Verification

The form is exercised by using `deno task dev`, not by a unit test.

## Child DOX Index

None.
