# src/skills

## Purpose

Rewrite a finished draft for an editorial profile without dropping claims or adding facts.

## Ownership

`editorial.ts` owns style catalogs, style prompts, `keepIfNotShortened`, and `applyEditorialStyle`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall back to professional
- Style pass rewrites in place: keep every claim and paragraph; do not add facts, sections, praise, or a conclusion
- Do not shorten. If the model returns under 90% of the input word count, keep the original
- Do not pad toward the word floor; `main.ts` extends again after this pass
- Missing API key returns the input unchanged

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert
- Prompt and `keepIfNotShortened` changes need matching tests

## Verification

`tests/pipeline_test.ts` covers `styleUserPrompt` and `keepIfNotShortened`.

## Child DOX Index

None.
