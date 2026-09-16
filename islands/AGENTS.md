# islands

## Purpose

Client form for a writing test. It does not call models itself.

## Ownership

`WriteForm.tsx` owns the topic, style, provider, and model fields, the stage widget, and the essay display.

## Local Contracts

- Read the event stream from `/api/write`
- Mark each `WRITE_STAGES` entry active, done, or error
- Show `error` in an alert. Show `markdown` from the essay event on the page.
- Style, provider, and model options come from the route, not a second catalog
- Changing provider resets the model to that provider's first model

## Work Guidance

Use DaisyUI 5 classes already included in `assets/styles.css`: `card`, `label`, `textarea`, `select`, `btn`, `alert`, `loading`, `steps`.

## Verification

The form is exercised by using `deno task dev`, not by a unit test.

## Child DOX Index

None.
