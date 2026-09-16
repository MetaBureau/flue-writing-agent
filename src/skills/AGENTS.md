# src/skills

## Purpose

Rewrite a finished draft for an editorial profile without dropping claims or adding facts.

## Ownership

`styles.ts` owns the style catalog. `editorial.ts` owns style prompts, `keepIfNotShortened`, and `applyEditorialStyle`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall back to professional
- Style pass rewrites in place. Cut praise and repeated claims. Do not add facts, sections, or a conclusion
- A long draft may come back shorter. Keep that rewrite when it ends as a sentence and has at least 80 words. Reject empty text and stubs
- Inputs under 200 words still reject a rewrite under half the original word count
- Do not pad toward the word floor. `main.ts` extends after this pass
- Missing API key returns the input unchanged

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert
- Prompt and `keepIfNotShortened` changes need matching tests

## Verification

`tests/pipeline_test.ts` covers `styleUserPrompt` and `keepIfNotShortened`.

## Child DOX Index

None.
