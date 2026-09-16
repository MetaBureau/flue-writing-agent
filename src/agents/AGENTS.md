# src/agents

## Purpose

Notes-only writing: JSON outline from notes, three voice drafts, pick by `--style`, then extend until the word floor without new facts.

## Ownership

`write.ts` owns outline/draft/extend prompts, word-count helpers, expansion acceptance, and model calls through `streamChat`.

## Local Contracts

- `wordCountFromTopic` defaults to 900 unless the topic contains `N words`
- Outline JSON: `{title, sections, wordCountTarget}`; sections must name material already in the notes; no invented intro/conclusion/roadmap
- Draft voices: conversational, professional, analytical. `VOICE_FOR_STYLE` maps economist and strunk-white to analytical, monocle to conversational, professional to professional
- Drafts cover every note and stop when notes are covered; no closing paragraph
- `extendDraft` unpacks factual note paragraphs (`>= 15` words) one at a time; `acceptExpansion` requires overlap with the source note and rejects off-topic text
- Missing API key: heuristic outline and stub drafts, no network

## Work Guidance

- Change prompts and acceptance rules together; tests assert the prompt strings
- Do not reintroduce length padding in the draft prompt; length is the extend step's job
- `extendToTarget` is the generic loop; `extendDraft` is the note-grounded production path used by `main.ts`

## Verification

`tests/pipeline_test.ts` covers pickDraft, prompts, word helpers, merge/extend loops, and expansion rejection.

## Child DOX Index

None.
