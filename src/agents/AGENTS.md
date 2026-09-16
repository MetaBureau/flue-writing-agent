# src/agents

## Purpose

Flue writing agent, plus the older notes-only draft script.

`writer.ts` is the Flue agent for `flue run`. The Fresh form does not call it. It streams `src/workflow.ts`.

`write.ts` still owns the older outline, three drafts, style pick, and extension used by `deno task start`.

## Ownership

- `writer.ts` registers Mercury (`FAST_MODEL_KEY`) and HaiMaker (`HAIMAKER_API_KEY`). The form does not call it. Those model rows set cost to zero and `reasoning: false`, and they do not go through `streamChat`.
- `run.ts` can boot Flue in Deno. The form does not use it.
- `write.ts` owns outline/draft/extend prompts, word-count helpers, expansion acceptance, and model calls through `streamChat`. The form workflow calls these stages.

## Local Contracts

- `wordCountFromTopic` defaults to 900 unless the topic contains `N words`
- Outline JSON: `{title, sections, wordCountTarget}`; at most four sections; sections must name material already in the notes; no invented intro/conclusion/roadmap and no split of one claim into several headings
- Outline sends `max_completion_tokens` (`OUTLINE_MAX_TOKENS`, 4096), the same cap as drafts and style. Notes are in the system message, and that notes prefix is the cache block. The user message is the stage instruction
- Outline may send `response_format` `json_schema` when the catalog lists `response_format`. Free-text JSON parsing remains the fallback
- Draft voices: conversational, professional, analytical. `VOICE_FOR_STYLE` maps economist and strunk-white to analytical, monocle to conversational, professional to professional
- Drafts cover every note, say each fact once, and stop when notes are covered; no closing paragraph
- `draftingNotes` drops paragraphs that describe the source page (`students can use`, `contains N words`) before the outline. Source titles and URLs stay. Outline, drafts, extend, and the notes file all use that text
- `extendDraft` unpacks those notes one paragraph at a time (`>= 15` words) and then drops `Source:` and `URL:` lines
- `acceptExpansion` requires overlap with the source note, rejects off-topic text, and rejects an expansion that repeats a draft paragraph (`repeatsDraft`, shared-word ratio `REPEAT_RATIO`)
- An expansion must be prose: it starts with a capital letter or a digit, has no numbered or bulleted lines, and has no scratch phrases (`let's count`, `wait,`)
- Extend makes one pass over the remaining notes. It stops when those notes are gone, the word floor is reached, or after 3 consecutive rejects or 6 calls. It does not start another round to fill the target. A cut-off reply counts as a reject and is not copied
- The saved essay is one `#` title plus the body. No `## Style:` line. A leading `#` title in the draft is stripped
- Missing API key: heuristic outline and stub drafts, no network

## Work Guidance

- Change prompts and acceptance rules together; tests assert the prompt strings
- In `Writer`, keep tool `run` bodies and optional chaining in module-level functions. `deno lint` (react-rules-of-hooks) reads an early `return` or `?.` in the agent body as a conditional hook call
- Do not reintroduce length padding in the draft prompt; length is the extend step's job
- `extendToTarget` is the generic loop; `extendDraft` is the note-grounded production path used by `main.ts`

## Verification

`tests/pipeline_test.ts` covers pickDraft, prompts, word helpers, merge/extend loops, and expansion rejection.

## Child DOX Index

None.
