# src/skills

## Purpose

Rewrite a finished draft for an editorial profile without dropping claims or
inventing statistics, studies, quotes, or sources.

## Ownership

`styles.ts` owns the style catalog. `editorial.ts` owns style prompts,
`keepIfNotShortened`, and `applyEditorialStyle`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall
  back to professional
- Style pass edits the draft into one essay. The preset controls wording:
  sentence length, voice, cutting filler and repetition. It must not change the
  brief's tone, purpose, or humour. Cut empty praise and filler; keep humour,
  irony, and tone the brief asks for. Do not invent statistics, studies, quotes,
  or sources. Do not add markdown links, URLs, or a call to action, and do not
  keep one already in the draft. The writer sees `writerFacts`, not source
  titles. The brief is required. The brief block plus the notes prefix is the
  Anthropic cache block, including when notes are empty
- If that edit is still one paragraph per note, style asks once more for one
  essay. Keep that rewrite when it ends as a sentence, has at least
  `essayLengthFloor` words, and is not a source survey, or has fewer
  source-owned paragraphs. Otherwise the first edit is kept
- A long draft may come back shorter. Keep that rewrite when it ends as a
  sentence and stays at or above `essayLengthFloor`. Reject empty text and stubs
- Inputs under 200 words still reject a rewrite under half the original word
  count
- Do not invent facts to hit the count. Extend already ran, so added sentences
  are styled. The style prompt states the floor-to-ceiling range. Do not cut
  below the length floor or past the ceiling
- Missing API key returns the input unchanged
- A cut-off style reply is discarded. The input is kept

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert
- Prompt and `keepIfNotShortened` changes need matching tests

## Verification

`tests/pipeline_test.ts` covers `styleUserPrompt` and `keepIfNotShortened`.

## Child DOX Index

None.
