# src/skills

## Purpose

Rewrite a finished draft for an editorial profile without dropping claims or adding facts.

## Ownership

`styles.ts` owns the style catalog. `editorial.ts` owns style prompts, `keepIfNotShortened`, and `applyEditorialStyle`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall back to professional
- Style pass rewrites in place. Cut praise and repeated claims. Do not add facts, sections, or a conclusion
- A long draft may come back shorter. Keep that rewrite when it ends as a sentence and has at least 80 words. Reject empty text and stubs
- When extend added words, also reject a style rewrite shorter than the draft before extend. A Mercury 2.5 call cut 391 words to 73; the 80-word stub rule discarded it, and 81 words would have been kept
- Inputs under 200 words still reject a rewrite under half the original word count
- Do not pad toward the word floor. Extend runs before this pass, so added sentences are styled
- Missing API key returns the input unchanged
- A cut-off style reply is discarded. The input is kept

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert
- Prompt and `keepIfNotShortened` changes need matching tests

## Verification

`tests/pipeline_test.ts` covers `styleUserPrompt` and `keepIfNotShortened`.

## Child DOX Index

None.
