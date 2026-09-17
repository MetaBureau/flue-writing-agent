# islands

## Purpose

Client form for a writing test. It does not call models itself.

## Ownership

`WriteForm.tsx` owns the prompt interview, topic, length, style, and writer radios, the stage widget, and the document modals.

## Local Contracts

- Read the event stream from `/api/write`
- Post the prompt interview to `/api/prompt`. An empty topic still starts the interview with `PROMPT_OPENING`. Show one question at a time. `Use this prompt` writes the reply into the topic. Do not call a model from the island
- Mark each `WRITE_STAGES` entry active, done, warning, or error. That list
  is Brief, Research, Plan, Draft, Critic
- Show `error` in an alert. Keep a skipped critic as `alert-warning` and
  `step-warning`. Keep notes, plan, draft, critic, and the essay as
  pieces, ordered notes → plan → draft → critic → essay via `pieceRank`. View opens a DaisyUI
  `modal`. Download writes that piece as `.md` using the piece filename. Do not
  dump the essay on the page. The essay piece label includes the body word count.
- Length options are `ESSAY_LENGTHS` from `src/contract.ts`, default 900. Post the chosen count as `words`. Do not read length from the topic on this form. A run outside 85%–115% of that count shows as an error
- Style names come from the route. Writer radios are `WRITER_OPTIONS` in `src/providers.ts`, default `anthropic/claude-sonnet-5`. The form posts that option's provider and model. It does not post a checker. The selected writer runs notes, plan, draft, and critic
- A missing key for the selected writer's provider disables Write and the interview

## Work Guidance

Use DaisyUI 5 classes already included in `assets/styles.css`: `card`, `label`, `textarea`, `select`, `radio`, `btn`, `alert`, `loading`, `steps`, `modal`, `chat`.

## Verification

The form is exercised by using `deno task dev`, not by a unit test.

## Child DOX Index

None.
