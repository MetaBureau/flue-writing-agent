# src/agents

## Purpose

Flue writing agent, plus plan, one draft, and length fit.

`writer.ts` is the Flue agent for `flue run`. The Fresh form does not call it.
It streams `src/workflow.ts`.

`write.ts` owns plan, draft, expand, and shorten used by `deno task start` and the form.

## Ownership

- `writer.ts` registers Mercury (`FAST_MODEL_KEY`) and HaiMaker
  (`HAIMAKER_API_KEY`). The form does not call it. Those model rows set cost to
  zero and `reasoning: false`, and they do not go through `streamChat`.
- `run.ts` can boot Flue in Deno. The form does not use it.
- `write.ts` owns plan/draft/expand/shorten prompts, word-count helpers, attributed
  notes extraction, and model calls through `streamChat`.

## Local Contracts

- `wordCountFromTopic` defaults to 900 unless the topic contains `N words`. A form `words` argument sets the plan target and wins over that topic count
- Plan JSON: `{title, claim, sections: [{heading, purpose, noteIds}], counters, gaps}`.
  `sectionLimit` caps sections by length. Headings do not start with
  Introduction or Conclusion. If the brief has no claim, `claim` is the one
  the notes can support. Notes keep attribution. Do not invent a statistic, a
  study, a quote, or a source. Encyclopaedia and live-blog notes cannot be a
  section's only support
- Draft writes one essay from the plan. Paraphrase; quoted words stay under
  15% of the body. Cite `[n3]` after figures, quotes, and attributed claims.
  Name the outlet or author the first time. Do not weave unused notes. Essays
  of 700 words or fewer use continuous prose
- Expand runs once when the draft is under `essayLengthFloor`. It expands thin
  sections from notes already in the plan. Shorten runs once when the draft is
  over `essayLengthCeiling`, and again after critic revise. It cuts filler and
  keeps citations
- Saving below 85% or above 115% throws. Do not trim sentences in code
- The saved essay is one `#` title, a `{n} words` line, then the body, then
  `## Sources` from cited note ids. No `## Style:` line
- Missing API key: heuristic plan, no draft network

## Work Guidance

- Change prompts and the cite harness together. Tests assert the prompt strings
  and the harness outcomes
- In `Writer`, keep tool `run` bodies and optional chaining in module-level
  functions. `deno lint` (react-rules-of-hooks) reads an early `return` or `?.`
  in the agent body as a conditional hook call

## Verification

`tests/pipeline_test.ts` covers plan JSON, draft prompts, attributed notes,
word helpers, and save length.

## Child DOX Index

None.
