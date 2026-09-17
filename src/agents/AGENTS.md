# src/agents

## Purpose

Flue writing agent, plus the older notes-only draft script.

`writer.ts` is the Flue agent for `flue run`. The Fresh form does not call it.
It streams `src/workflow.ts`.

`write.ts` still owns outline, parallel drafts, Mercury synthesis, and
extension used by `deno task start`.

## Ownership

- `writer.ts` registers Mercury (`FAST_MODEL_KEY`) and HaiMaker
  (`HAIMAKER_API_KEY`). The form does not call it. Those model rows set cost to
  zero and `reasoning: false`, and they do not go through `streamChat`.
- `run.ts` can boot Flue in Deno. The form does not use it.
- `write.ts` owns outline/draft/synthesis/extend prompts, word-count helpers,
  expansion acceptance, and model calls through `streamChat`. The form workflow
  calls these stages.

## Local Contracts

- `wordCountFromTopic` defaults to 900 unless the topic contains `N words`. A form `words` argument, when passed to `generateOutline`, sets the target and wins over that topic count
- Outline JSON: `{title, sections, wordCountTarget}`; at most four sections; an
  opening, a body, and a close. Opening, body, and close may add argument and
  widely known general knowledge. Leave out a note that is not about the
  subject. Do not invent a statistic, a study, a quote, or a source
- Outline sends `max_completion_tokens` (`OUTLINE_MAX_TOKENS`, 4096), the same
  cap as drafts and style. Notes are in the system message, and that notes
  prefix is the cache block. The user message is the stage instruction
- Outline may send `response_format` `json_schema` when the catalog lists
  `response_format`. Free-text JSON parsing remains the fallback
- Drafts run in parallel on the HaiMaker trio, or one writer fallback when that
  key is missing. `generateDrafts` takes `readonly ModelConfig[]`. Empty drafts
  throw. `synthesizeEssay` calls Mercury 2.5 with `SYNTHESIS_MAX_TOKENS`
  (65,536), or the writer with `completionTokensForLength`, or the longest
  draft. `Synthesis.source` is `mercury`, `writer`, or `longest-draft`. A
  longest-draft fallback sets `fallback: true` and is logged as a warning
- Drafts write one essay from the notes that belong to the subject. Write about
  `wordCountTarget` words. Say each specific fact once. Notes source specifics;
  argument and general knowledge are allowed. `briefBlock` is on the cached
  prefix and in the user prompt. Stage rules are defaults. Close in a way that
  serves the brief's purpose. Humour, irony, or narrative are allowed when the
  brief asks. Do not paste source titles, URLs, markdown links, or a call to
  action. `stripBodyLinks` removes body links and URLs. `dropCallsToAction`
  removes only shop phrases (`click here`, `shop now`, `buy now`, `order now`,
  `visit our`). Ordinary sentences stay. `essayReadyToSave` cleans, then checks
  the length floor, so a deletion cannot save a short essay
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
  a   reply that does not grow, and a cut-off. `assertEssayLength` then requires
  `essayLengthFloor` (85% of the request). Merge and extend prompts state
  `lengthRange`: between that floor and `essayLengthCeiling` (115%).
  `capEssayLength` trims body sentences from the paragraph before the close,
  keeping the first and last paragraphs, and does not go under the floor.
  Synthesis treats repetition as a fault
- The saved essay is one `#` title, a `{n} words` line, then the body. No `## Style:` line. That count and the length floor exclude the Sources list. A leading title line, a repeated paragraph, an unfinished sentence, and a sentence about the source paper are stripped before fact-check, unless that strip would drop the body below `essayLengthFloor`. The file name is the topic, not the outline title
- Missing API key: heuristic outline and stub drafts (one per keyless model), no
  network. Missing Mercury and writer keys fall synthesis back to the longest
  draft

## Work Guidance

- Change prompts and acceptance rules together; tests assert the prompt strings
- In `Writer`, keep tool `run` bodies and optional chaining in module-level
  functions. `deno lint` (react-rules-of-hooks) reads an early `return` or `?.`
  in the agent body as a conditional hook call
- Drafts name the requested count. Extend weaves unused notes. Do not invent
  statistics, studies, quotes, or sources
- `extendToTarget` is the generic loop. `extendDraft` is the production path:
  repeated weaves until the target, the call cap, or consecutive rejects

## Verification

`tests/pipeline_test.ts` covers acceptedDrafts, longestDraft, pickSynthesizedText,
prompts, word helpers, merge/extend loops, synthesis token caps, and expansion rejection.

## Child DOX Index

None.
