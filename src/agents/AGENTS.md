# src/agents

## Purpose

Flue writing agent, plus the older notes-only draft script.

`writer.ts` is the Flue agent for `flue run`. The Fresh form does not call it.
It streams `src/workflow.ts`.

`write.ts` still owns the older outline, three drafts, style pick, and extension
used by `deno task start`.

## Ownership

- `writer.ts` registers Mercury (`FAST_MODEL_KEY`) and HaiMaker
  (`HAIMAKER_API_KEY`). The form does not call it. Those model rows set cost to
  zero and `reasoning: false`, and they do not go through `streamChat`.
- `run.ts` can boot Flue in Deno. The form does not use it.
- `write.ts` owns outline/draft/extend prompts, word-count helpers, expansion
  acceptance, and model calls through `streamChat`. The form workflow calls
  these stages.

## Local Contracts

- `wordCountFromTopic` defaults to 900 unless the topic contains `N words`. A form `words` argument, when passed to `generateOutline`, sets the target and wins over that topic count
- Outline JSON: `{title, sections, wordCountTarget}`; at most four sections; an
  opening, a body, and a close. The opening and close may only frame facts
  already in the notes. Leave out a note that is not about the subject
- Outline sends `max_completion_tokens` (`OUTLINE_MAX_TOKENS`, 4096), the same
  cap as drafts and style. Notes are in the system message, and that notes
  prefix is the cache block. The user message is the stage instruction
- Outline may send `response_format` `json_schema` when the catalog lists
  `response_format`. Free-text JSON parsing remains the fallback
- Draft voices: conversational, professional, analytical. `VOICE_FOR_STYLE` maps
  economist and strunk-white to analytical, monocle to conversational,
  professional to professional
- Drafts write one essay from the notes that belong to the subject. Write about
  `wordCountTarget` words. Say each fact once. Open on the subject and close on
  a fact already used. Do not paste source titles, URLs, or markdown links
- `draftingNotes` drops paragraphs that describe the source page
  (`students can use`, `contains N words`) or that are about writing an essay
  (`admissions essay`, `how to write`). The notes file keeps source titles and
  URLs. Outline, drafts, extend, and style use `writerFacts`: those titles and
  URLs are stripped, and the remaining facts are one block
- `isSourceCollage` is true when at least two paragraphs each overlap only one
  note. Style rewrites that survey and keeps the rewrite only when fewer
  paragraphs belong to a single note
- `factualNotes` keeps paragraphs of at least 15 words and drops page
  descriptions and `Source:` / `URL:` lines. Extend uses that to decide whether
  a weave is worth calling
- `acceptExpansion` requires overlap with the source note, rejects off-topic
  text, and rejects an expansion that repeats a draft paragraph (`repeatsDraft`,
  shared-word ratio `REPEAT_RATIO`). It is the older per-note check. Production
  extend does not call it
- An expansion must be prose: it starts with a capital letter or a digit, has no
  numbered or bulleted lines, and has no scratch phrases (`let's count`,
  `wait,`)
- Extend weaves unused note facts into the existing essay until
  `wordCountTarget` or the call cap. Each weave replaces the draft. It rejects a
  reply that copies the draft and appends, a reply that is not a finished essay,
  a reply that does not grow, and a cut-off. `assertEssayLength` then requires
  `essayLengthFloor` (85% of the request)
- The saved essay is one `#` title plus the body. No `## Style:` line. A leading
  title line, a repeated paragraph, an unfinished sentence, and a sentence about
  the source paper are stripped before fact-check, unless that strip would drop
  the body below `essayLengthFloor`. The file name is the topic, not the outline
  title
- Missing API key: heuristic outline and stub drafts, no network

## Work Guidance

- Change prompts and acceptance rules together; tests assert the prompt strings
- In `Writer`, keep tool `run` bodies and optional chaining in module-level
  functions. `deno lint` (react-rules-of-hooks) reads an early `return` or `?.`
  in the agent body as a conditional hook call
- Drafts name the requested count. Extend must reach it from unused notes, not
  invented facts
- `extendToTarget` is the generic loop. `extendDraft` is the production path:
  repeated weaves until the target, the call cap, or consecutive rejects

## Verification

`tests/pipeline_test.ts` covers pickDraft, prompts, word helpers, merge/extend
loops, and expansion rejection.

## Child DOX Index

None.
