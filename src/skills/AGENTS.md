# src/skills

## Purpose

Rewrite a finished draft for an editorial profile without dropping claims or
adding facts.

## Ownership

`styles.ts` owns the style catalog. `editorial.ts` owns style prompts,
`keepIfNotShortened`, and `applyEditorialStyle`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall
  back to professional
- Style pass edits the draft into one essay. Cut praise, repetition, and
  sentences that are not about the subject. An opening and a close may use only
  facts already in the draft. Do not add facts. Do not add markdown links. The
  writer sees `writerFacts`, not source titles. Only the notes prefix is marked
  for Anthropic prompt cache
- If that edit is still one paragraph per note, style asks once more for one
  essay. Keep that rewrite when it ends as a sentence, has at least
  `essayLengthFloor` words, and is not a source survey, or has fewer
  source-owned paragraphs. Otherwise the first edit is kept
- A long draft may come back shorter. Keep that rewrite when it ends as a
  sentence and stays at or above `essayLengthFloor`. Reject empty text and stubs
- Inputs under 200 words still reject a rewrite under half the original word
  count
- Do not invent facts to hit the count. Extend already ran, so added sentences
  are styled. Do not cut below the length floor
- Missing API key returns the input unchanged
- A cut-off style reply is discarded. The input is kept

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert
- Prompt and `keepIfNotShortened` changes need matching tests

## Verification

`tests/pipeline_test.ts` covers `styleUserPrompt` and `keepIfNotShortened`.

## Child DOX Index

None.
