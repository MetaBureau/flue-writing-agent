# src/skills

## Purpose

Style catalog for draft wording. Not a rewrite pass.

## Ownership

`styles.ts` owns the style catalog and `styleSystemPrompt`.

## Local Contracts

- Styles: economist, strunk-white, monocle, professional; unknown names fall
  back to professional
- The preset is added to the draft prompt. It controls wording: sentence
  length, voice, cutting filler. It must not change the brief's tone, purpose,
  or humour. Do not invent statistics, studies, quotes, or sources
- There is no `applyEditorialStyle` rewrite and no `writerFacts`

## Work Guidance

- Sample sentences in `styles` are the voice target, not extra facts to insert

## Verification

`tests/pipeline_test.ts` covers `styleSystemPrompt` in the draft prompt.

## Child DOX Index

None.
