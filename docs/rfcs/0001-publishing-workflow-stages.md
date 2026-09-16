# RFC 0001: Align writing stages with an AI-era publishing workflow

- Status: Draft. Phase 0 is implemented except the actual-cost half of item 5. Phase 1 items 1–6 are implemented. Items 7–9 are not approved.
- Date: 2026-09-17 (updated 2026-09-17: pet-cat findings, Phase 0, peer review, then Phase 1 items 1–6)
- Author: Stew Milne
- Scope: `src/workflow.ts`, `src/main.ts`, `src/complete.ts`, `src/providers.ts`, `src/notes.ts`, `src/agents/write.ts`, `src/agents/writer.ts`, `src/skills/`, `src/contract.ts`, `islands/WriteForm.tsx`

## Summary

The pipeline does reporting well and keeps essays to facts in the notes. It is thin on editing, has no checks or approvals before publication, and runs two stages in the wrong order.

A real run showed the cost of those gaps. `output/essay-on-my-pet-cat.md` cost $0.51 on Gemini 3.5 Flash. Hidden reasoning was 95% of the output tokens and about $0.46 (90%) of the cost. The essay was about essay-sample websites, repeated itself, and contained the model's word-counting scratch work.

This RFC maps each stage to a traditional publishing workflow and records that evidence. It proposes guards on cost and truncated output first, built on HaiMaker's documented features (catalog, usage, spend logs, key budgets, auto router) rather than app code. Then it proposes an order that keeps the notes-only rule. That order adds a separate editor and fact-checker, citations, and human approval points.

## Current pipeline

Before Phase 1 the order was `research → outline → drafts (3 tones) → pickDraft → style → extend → save`. Phase 1 runs extend before style: `research → outline → drafts (3 tones) → pickDraft → extend → style → save`.

The form and the CLI run the same stages. One provider and model (chosen in the form or with `--model`) runs every stage. Before Phase 0, `streamChat` sent no reasoning setting, accepted any `finish_reason`, and recorded no token usage or cost.

## Gap analysis

| Stage in code | Publishing equivalent | How close |
|---|---|---|
| — | **Commission / brief** (angle, audience, purpose, length) | **Missing.** The topic string is the whole brief. Only the word count is read from it (`wordCountFromTopic`). |
| `research` (`src/notes.ts`) | **Reporting** | **Partial.** Notes-only is sound discipline. But it runs one search, keeps at most 5 excerpts of 180 words each, never judges source quality, and has no primary sources. |
| `outline` | **Pitch / structure** | **Partial.** Sections must come from the notes. But the structure follows whatever material turned up, not an argument. There is no main point or opening, and the prompt bans an introduction or conclusion unless the notes contain one. |
| `drafts` + `pickDraft` | **Drafting** | **Weak.** Three drafts are written, but `pickDraft` takes the one whose tone matches the style. The other two are never read, so two of three calls are wasted. |
| `style` (`applyEditorialStyle`) | **Line edit / house style** | **Good fit.** `keepIfNotShortened` protects against a bad rewrite. But it merges line and copy editing, and no structural edit comes before it. |
| `extend` (`extendDraft`) | **Fit to length** | **Out of order and unguarded.** Paragraphs are added after the style pass, so that text is never styled. `groundedInNote` only checks that at least 3 content words overlap with a note, which is not a fact check. It calls the model for every note paragraph, up to 3 rounds, however many attempts fail. |
| — | **Fact-check** | **Missing.** No claim is checked against its source. |
| — | **Attribution / citations** | **Missing.** The notes carry source URLs, but the essay never cites them. |
| — | **Headline, standfirst (summary line under the headline), SEO** | **Missing.** The outline title is used as the headline, unedited. |
| — | **Legal / ethics / originality** | **Missing.** Drafts are close rewrites of search excerpts, so copying too closely from a source is a real risk. |
| — | **Proofread / final approval** | **Missing.** Nothing stops for a person. |
| — | **Publish, corrections, versions** | **Missing.** The output file is named after the topic, so a later run on the same topic overwrites it. `## Style: <name>` is written into the essay, and the draft's own `#` title is added under a second one. The notes are not saved, so claims cannot be checked afterwards. |
| — | **Budget / production cost** | **Missing.** There is no per-run cost, no reasoning limit, and nothing that stops a run spending more. |

### What already fits the AI era

- **Grounding.** The notes are the only facts, Tavily's synthesized answer is excluded, and the prompts repeat "do not invent".
- **Rejecting bad model output.** Rejected expansions, the keep-if-not-shortened rule, and a fallback outline for bad JSON. The pet-cat run shows these guards check word counts and overlap, not whether text is prose.

### What misses the AI era

1. **The writer checks itself.** One model runs every stage, so no second model catches its errors.
2. **Checking is word overlap, not claims.** Nothing links a claim to a source excerpt and URL.
3. **No person approves anything.** There is no approval of the brief or outline, and no sign-off before publication.
4. **No record of where facts came from.** No list of which sources support which paragraph, and no AI disclosure.
5. **The Monocle style works against the notes-only rule.** Its transformation says "add constructive framing", which invites invented optimism.
6. **Model cost and behaviour are invisible.** Reasoning models bill hidden thinking as output tokens, and the pipeline neither limits nor reports it.

## Evidence: the pet-cat run

Topic: "essay on my pet cat". Style: economist. Model: `google/gemini-3.5-flash` through HaiMaker. Output: `output/essay-on-my-pet-cat.md`, 935 words, of which about 250 are the actual essay.

### Cost

Taken from HaiMaker spend logs (queried at the undocumented `/spend/logs`; `/spend/logs/v2` is the documented endpoint). Cost is input tokens at $1.50/M plus output tokens (including reasoning) at $9.00/M, which matches the logged `spend`:

| Stage | Calls | Input tokens | Output tokens | Of which reasoning | Cost |
|---|---|---|---|---|---|
| Outline, 3 drafts, style | 5 | 6,554 | 10,225 | 9,122 (89%) | $0.102 |
| Extend | 11 | 12,977 | 43,356 | 41,870 (97%) | $0.409 |
| **Total** | **16** | **19,531** | **53,581** | **50,992 (95%)** | **$0.511** |

Output alone is $0.482 (94% of the cost); input is $0.029.

Earlier whole-essay runs on `google/gemini-3.1-flash-lite` cost about $0.01 each.

### Quality defects and causes

| # | Defect | Cause |
|---|---|---|
| 1 | Word-counting scratch work in the essay (`(66) "cat" (67) "and"…`, "wait, hyphenated word") | 10 of 11 extend calls hit `max_tokens` (4096) after about 3,930 reasoning tokens. They returned `finish_reason: "length"` with the tail of the reasoning as content. `streamChat` accepted it. `fitExtension` trims to the last full stop, and "85. two" has one. `acceptExpansion` passed it (reproduced: 139 words, accepted). |
| 2 | Essay describes essay-sample websites ("School Essay Writer published…", "the first essay contains 200 words") | The search returns essay mills. Their descriptions of their own pages become notes. `extendDraft` expands every note paragraph, including the `Source:` / `URL:` listings. |
| 3 | Near-duplicate paragraphs: two reworded pairs (lines 21/93 and 97/99), and line 101 repeats facts from 93 | `repeatsDraft` only flags text with fewer than 4 new content words, and a reworded repeat has more (reproduced for two pairs). |
| 4 | Paragraph starts mid-sentence ("show how cats act as pets.") | `fitExtension` trims the end of a reply, never the start. |
| 5 | ~680 of 935 words are padding | Drafts stop when the notes are covered, so extend fills to 900 words from weak notes, after the style pass. |
| 6 | Title twice, plus `## Style: economist` | The draft includes its own `#` title, and `workflow.ts` adds a heading and the style line on top. |
| 7 | "my pet cat" becomes a stranger's cat, with a heading copied from a sample essay | No brief. The pipeline cannot know the user's cat, and the outline copies headings from the notes. |

## Evidence: reasoning behaviour of picker models

A 60-word prompt on each HaiMaker model in the picker, streamed with `stream_options.include_usage`. The table shows reasoning tokens for each `reasoning_effort` value.

The HaiMaker docs only document `low`, `medium`, and `high`. `none` and `minimal` are not in the HaiMaker contract, and this table is not a basis for design (see "Use HaiMaker's documented features").

| Model | Catalog `supports_reasoning` | Out $/M | Omitted | `none` | `minimal` | `low` |
|---|---|---|---|---|---|---|
| `google/gemini-3.1-flash-lite` | yes | 1.50 | 0 | 0 | 0 | 123 |
| `google/gemini-3.5-flash` | yes | 9.00 | **2,880** | HTTP 400 ("Reasoning is mandatory") | 0 | 1,711 |
| `openai/gpt-5.4-mini` | yes | 4.50 | 0 | 0 | 0 | 251 |
| `openai/gpt-4.1` | no | 8.00 | 0 | 0 | 0 | 0 |
| `anthropic/claude-haiku-4-5` | yes | 5.00 | 0 | 0 | HTTP 400 (temperature conflict) | HTTP 400 |
| `anthropic/claude-sonnet-5` | yes | 10.00 | 0 | 0 | 0 | 0 |
| `deepseek/deepseek-v4-flash` | yes | 0.60 | **1,085** | 0 | 388 | 604 |
| `moonshotai/kimi-k2.6` | yes | 4.00 | **666** | 1,970 | 2,067 | 2,450 |

What it shows:

- **`supports_reasoning: true` means a model *can* reason, not that it reasons by default.** Gemini 3.5 Flash, DeepSeek V4 Flash, and Kimi K2.6 reason when the parameter is left out. That default is not a catalog field. The picker says "can reason" and does not use this table.
- **The documented `low` still reasons** on Gemini 3.5 Flash (1,711 tokens). Documented `reasoning_effort` levels cannot switch reasoning off.
- **Streamed usage reports `completion_tokens_details.reasoning_tokens`**, as the HaiMaker prompt-caching page documents, but it has no cost field.

## Use HaiMaker's documented features

Source: https://docs.haimaker.ai (all pages read 2026-09-17), plus `GET /openapi.json` and `GET /public/model_hub`.

Phase 0 must use what HaiMaker already provides rather than rebuild it. Each need maps to a documented feature:

| Need | HaiMaker feature | Doc |
|---|---|---|
| Model list, prices, capabilities | `GET /public/model_hub` (no key): `input_cost_per_token`, `output_cost_per_token`, `supports_reasoning`, `supported_openai_params`, `max_output_tokens`, `mode`, `health_status`. `GET /v1/models` lists the models this key can call. "The model catalog changes independently of the docs." | Getting started |
| Bound output **including reasoning** | `max_completion_tokens`: "an upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens". | Chat Completions input |
| Reasoning level | `reasoning_effort`: `low` / `medium` / `high`. For Anthropic, `thinking: {type: "enabled", budget_tokens}`. The response carries reasoning in a separate `reasoning_content` field. The docs do not say reasoning can never appear in `content`. | Thinking / Reasoning Content |
| Turn Gemini thinking off | HaiMaker accepts Gemini `generateContent` at `/v1beta/models/{model}:generateContent`, with `streamGenerateContent` for streaming. The model id is URL-encoded (`google%2Fgemini-2.5-flash`). The HaiMaker page does not mention `thinkingConfig`. Gemini's own `generationConfig.thinkingConfig` is Google's control, and passthrough is untested (Phase 2 item 8). | Gemini generateContent |
| Which endpoint to call | Chat Completions (`POST /v1/chat/completions`) serves catalog entries with `mode: "chat"`. The Responses API (`POST /v1/responses`) is only for entries with `mode: "responses"`: "Do not assume a chat model is also a Responses model." Every model in the picker is `mode: "chat"`, so the pipeline stays on Chat Completions. The catalog `mode` decides the endpoint for any model added later. | Responses API |
| Anthropic thinking control | Anthropic Messages at `POST /v1/messages`, with Anthropic's documented `thinking` block. | Anthropic Messages |
| Per-call tokens | `stream_options: {include_usage: true}` adds a final usage chunk: `prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`. | Usage, Prompt Caching |
| Authoritative cost | Catalog prices are "default-tier reference prices, not a guaranteed quote… Existing usage and billing rules remain authoritative." Actual spend is in `GET /key/info` (`spend`) and `GET /spend/logs/v2?start_date&end_date&page&page_size` (per request: `spend`, `model`, tokens, `metadata`). | Prompt Caching, Key Management, Auto-router |
| Spending limits | Key `max_budget` + `budget_duration`, `soft_budget` (alert only), `model_max_budget` per model, a `models` allowlist, `rpm_limit` / `tpm_limit`, `max_parallel_requests`. Service account keys (team-owned) are recommended for integrations. | Key Management, Service Account Keys |
| Cheapest provider for a model | Request `provider: {sort: "price" \| "latency"}` (price is the default). | Chat Completions input |
| Outline JSON | `response_format: {type: "json_schema", json_schema, strict: true}` for OpenAI, Gemini, Anthropic, and others, or `{type: "json_object"}`. | Structured Outputs |
| Repeated notes in every prompt | Prompt caching. Automatic for OpenAI-style providers (1,024+ tokens) and DeepSeek, `cache_control: {type: "ephemeral"}` for Anthropic. Hits show in `cached_tokens`. Cache prices are in the catalog. | Prompt Caching |
| Tools for the Flue `Writer` agent | Function calling: standard `tools` and `tool_choice` (`"auto"`, `"none"`, or a named function). A tool call returns `finish_reason: "tool_calls"` with `message.tool_calls`, and results go back as `role: "tool"` messages with `tool_call_id`. It works across providers by changing only the model name. All eight picker models have `supports_function_calling: true` and `tool_choice`, and none has `supports_parallel_function_calling`. | Function Calling |
| Structured claim lists (fact-check) | Either `response_format` `json_schema`, or a forced tool call (`tool_choice: {type: "function", function: {name}}`) whose arguments are the structured result. | Structured Outputs, Function Calling |
| Live web search | `web_search_options` (`search_context_size`: `low`/`medium`/`high`, `user_location`) on Chat Completions for models whose catalog entry lists it, or the `web_search_preview` tool on `/v1/responses`. Each provider uses its own search backend. The docs describe the output only as the model's answer (`message.content`); they document no source list or citation field. `/v1/model_group/info` reports `supports_web_search`. | Web Search |
| Different model per stage | Auto router, managed as code through the Management API (next section). | Auto-router, Management API |

Consequences for the pipeline:

- **Cut-off replies.** A reasoning model that hits `max_tokens` returns `finish_reason: "length"`, which the pet-cat run shows. The fix is to set `max_completion_tokens` and reject `length`, not to raise the cap.
- **`content` is not guaranteed to be clean copy.** The scratch work in the essay came back in `content` from calls that ended with `finish_reason: "length"`, and `streamChat` returns `content` without checking `finish_reason` (`src/complete.ts:78`, `src/complete.ts:140`). The docs show `reasoning_content` as a separate field, but do not promise reasoning never reaches `content`. The guard is to reject `length`, plus the Phase 1 prose checks, not to trust `content`.
- **The hard-coded model ids and labels in `src/providers.ts` duplicate the catalog, and `src/agents/writer.ts` sets every cost to zero and `reasoning: false`.** Read `supports_reasoning` and prices from `/public/model_hub`, and filter to the models `/v1/models` allows for the key.
- **Research stays on Tavily for now; web search is a decision to make.** The HaiMaker web search docs describe only the model's written answer, with no documented source list or citations. Feeding that answer into the notes breaks the notes-only rule (`AGENTS.md`: Tavily must not feed a synthesized answer into notes), and `src/AGENTS.md` forbids extra research providers. A later use that fits the rule is a fact-check lookup, where search confirms or rejects a claim that is already in the draft and never adds facts. That needs the rule changed and a check of whether responses carry citations.
- **The Flue `Writer` agent already uses function calling** (`search_notes`, `read_page`, `save_essay` through pi-ai's `openai-completions` API). Under `haimaker/auto`, capability detection limits its requests to models with `supports_function_calling`. Its model list should come from the catalog filtered on that flag.

## HaiMaker auto router

Sources: https://docs.haimaker.ai/docs/auto_router, https://docs.haimaker.ai/docs/auto_router_api

How it works:

- `model: "haimaker/auto"`. **The response `model` field is the model that actually handled the request.** Routing is deterministic, with no LLM in the request path.
- It runs in order:
  1. **Capability detection.** A `response_format.type` of `json_schema` filters on `supports_response_schema`, a router-internal flag that `/public/model_hub` does not expose; a long context needs `max_input_tokens` with a 10% buffer.
  2. **Example rules.** 3–10 example prompts plus a `target_model`. The router embeds the **last user message** and matches it to each rule's examples by cosine similarity, above `match_threshold` (default 0.80). Rules can also require capabilities or match the first turn only.
  3. **The default model.**
  4. **The cheapest capable model** as a fallback.
- The `reasoning` capability always passes detection. It is meant to be combined with example prompts, to send analytical work to a reasoning model.
- "Cost tracking and rate limits apply to the resolved model." Spend logs record `auto_routed_from`, `auto_routed_model`, `auto_routing_trigger`, `auto_routing_similarity`, and `auto_routing_rule_source`.
- One router per key; a key with no router returns an error for `haimaker/auto`. No recursive routing. Configuration is cached for 60 seconds.
- **Learning:** traffic capture stores the normalized last user message (up to 2 KB, deleted after 30 days). A daily tuner proposes strictly cheaper rules, which auto-apply only for trivial, tight clusters of 50+ requests over 3+ days, and auto-revert if 5xx errors double. `capture_enabled` and `auto_apply_enabled` are both on by default.

**Management API, so the router can live in the repo** (service account key recommended):

- `POST /auto-router/new` with `router_name`, `default_model`, and `rules[]`. Each rule has `rule_order`, `example_prompts` (up to 50), `match_threshold`, `required_capabilities`, `initial_turn_only`, `enabled`, and `target_model`.
- `GET /auto-router/{id}/info`, `POST /auto-router/{id}/update` (default model, `capture_enabled`, `auto_apply_enabled`), and `GET /auto-router/list`.
- Rules: `POST` / `PUT` / `DELETE /auto-router/{id}/rules[/{rule_id}]`, `POST …/rules/reorder`, and `POST …/rules/{rule_id}/revert` for mined rules.
- **`POST /auto-router/{id}/simulate`** takes a `prompt` or full `messages`/`tools`. It returns `resolved_model`, `reason`, `similarity`, and a per-rule breakdown, **without an LLM call and free of charge**.
- Proposals: `GET …/proposals?status=`, then `…/accept` or `…/reject`. Traffic: `GET …/traffic-summary?days=`.
- Assign the router with `POST /key/update {key, auto_router_id}`.

Fit for this pipeline:

- **Stage routing needs prompt restructuring.** Only the last user message is embedded. Today each stage's user message contains the full notes and draft, so stages look alike to the router. Put notes and drafts in the system message, and keep the user message as a short, stage-specific instruction. Rules then have distinct examples per stage (outline, draft, style, extend, and later fact-check). The same layout gives a shared prefix across calls, which prompt caching needs.
- **The router config becomes a versioned file**, applied with the Management API. Its rules are checked with `/simulate` in verification, at no LLM cost.
- **Reasoning cost is set per rule target**, by choosing target models that do not reason by default for draft, style, and extend. Reserve the `reasoning` capability for outline or fact-check.
- **Privacy:** traffic capture stores the user message. With notes in the system message, captured text is the stage instruction, not source content. Decide whether `capture_enabled` stays on.

## Proposal

Target order:

```
brief → research → outline (+ human approval) → one draft in the target voice
→ structural edit (different model) → fact-check against sources, add citations
→ line/house-style edit (length fitted here)
→ headline + standfirst → legal / originality check → proofread → human approval
→ publish (version + source list) → corrections
```

### Principles

- The notes stay the only source of facts. New stages may cut or cite, never add unsupported claims.
- The writer and the editor/fact-checker are different models by default.
- Every published claim traces to a source URL in the notes.
- A person approves before anything is published.
- Use the provider's documented features before building our own: catalog, usage, spend logs, key budgets, auto router.
- A run's cost is known and shown. Call caps bound each run, and HaiMaker key budgets set a ceiling for the key. A reply that was cut off is never used as copy.

## Phased plan

### Phase 0: cost and output guards, using documented HaiMaker features (approved 2026-09-17; revised after peer review)

Items 1–7 do not depend on moving notes into the system message. What each item does:

- **Item 1 stops junk copy**, but only after the tokens are billed.
- **Items 3 and 4 stop the call blow-up.** The 11 extend calls come from looping every note paragraph for up to 3 rounds (`src/agents/write.ts:308`).
- **Item 7 is only a ceiling on the key**, not a limit per run.

1. **Reject cut-off replies.** Send `max_completion_tokens` (the cap that includes reasoning) instead of `max_tokens`. Treat `finish_reason: "length"` as a failure: extend and style discard the reply, and outline and drafts surface an error. Do not treat `content` as safe copy on its own; the Phase 1 prose checks still apply. Outline sends the same cap as drafts and style (`OUTLINE_MAX_TOKENS`, 4096). Without a cap, a model that reasons by default can run with no bound, and a cut-off cannot be detected.
2. **Read the catalog, not a hard-coded list.** Load `/public/model_hub` for prices, `supports_reasoning`, `supported_openai_params`, and `max_output_tokens`, and intersect it with `/v1/models` for the key. Keep a short curated list of ids for the picker; the labels, prices, and reasoning flag come from the catalog. If the key list shares no picker id, show an empty picker and a warning. Do not fall back to the curated list.
   - Checked 2026-09-17 on the writer key: `GET /v1/models` returned an OpenAI list (`data[].id`, `object`, `created`, `owned_by`). 458 of 459 ids contained `/`. All eight picker ids were present as `provider/model`, the same form as catalog `model_group`. The list also includes wildcards (`*`, `xai/*`). Exact match is valid. An empty intersection is an allowlist miss, not a format mismatch.
3. **Control reasoning only through documented parameters.** Send `reasoning_effort` only when the catalog lists it in `supported_openai_params`, and only with documented values. For no reasoning, prefer models that do not reason by default.
4. **Bound extend's calls.** Stop after 3 consecutive rejected expansions, and cap the total extend calls per run.
5. **Record usage and cost per run.** Request `stream_options.include_usage`, and log prompt, cached, output, and reasoning tokens per stage. Show an **estimate** during the run, from catalog prices. For the **actual** cost, set the documented Chat Completions `user` field to a run id on every call, then sum the `/spend/logs/v2` rows carrying that id for the run's dates. Label the two as estimate and actual.
   - `/key/info` before-and-after and time windows are rejected: both mix runs that overlap.
   - The docs name `user` ("a unique identifier representing your end-user"), but the public docs do not say which spend-log field records it. The live auto-router page documents `/spend/logs/v2` with only `start_date`, `end_date`, `page`, and `page_size`. A spend-tracking page outside the public doc set (`/docs/proxy/cost_tracking`, now 404) said the request `user` is stored as spend-log `end_user`, and that the log's `user` is the key owner. It also showed a `/spend/logs/v2?end_user=` filter. Neither is a contract: make one tagged call and look for the run id in `end_user`, not `user`, before relying on it. Until then, ship the estimate only.
6. **Label the picker** with catalog data, e.g. "Gemini 3.5 Flash · can reason · $9/M out". Do not label "reasons by default". That behavior is trial evidence in the table above, not a catalog field.
7. **Set a key ceiling.** Use a dedicated service account key for the writer, with `max_budget` + `budget_duration`, a `soft_budget` alert, and a `models` allowlist matching the picker. Optionally set `model_max_budget` for expensive models. Document the setup in `.env.example` and `README.md`.
8. **Fix repo docs that contradict the docs or the code.**
   - `README.md` provider section: `FAST_MODEL_ID=haimaker/auto` with `FAST_MODEL_KEY`. The code reads `HAIMAKER_API_KEY`, and `haimaker/auto` errors without a router.
   - Replace `HAIMAKER.md`, which predates the integration.
   - Update the root rule "Fast model drafts; reasoning model outlines" (`AGENTS.md:89`): one chosen model now runs every stage.

Known gap, not fixed in Phase 0: `src/agents/writer.ts` does not call `streamChat`. The form and CLI do not use it. It registers models through pi-ai with `maxTokens`, every cost at zero, and `reasoning: false`. Cut-off rejection, the usage meter, and catalog prices do not apply on that path.

### Phase 1: cheap quality fixes, no new stages (approved 2026-09-17, except items 7–9)

Items 1–5 can ship after Phase 0. Item 6 needs Phase 0's usage log (item 5), not Phase 2.

1. Reject expansions that are not prose: numbered or bulleted lines, scratch-work phrases ("let's count", "wait,"), and text that does not start with a capital letter. Add a test using the pet-cat scratch work.
2. Detect repeats against every existing paragraph by shared-word ratio, not a count of new words.
3. Drop notes that describe the source page itself ("this essay contains N words", "students can use") before the outline, and give that text to every stage. Leave out `Source:` / `URL:` lines when extending, not before. The drafts still need the source titles and URLs.
4. Run `extend` before `style`, so all text is styled, and stop when no good notes are left rather than always filling to target. When extend added words, style may not return a piece shorter than the draft before extend.
5. Remove a leading `#` title from the draft. Stop writing `## Style:` into the essay in `workflow.ts`, `main.ts`, and `writer.ts`.
6. Save the notes, model, and run cost next to the essay (`output/<slug>.notes.md`).
7. Write one draft in the voice from `VOICE_FOR_STYLE` instead of three.
8. Make output filenames unique (slug plus timestamp or run id).
9. Remove "add constructive framing" from the Monocle transformation.

Items 1–6 are in the form and CLI. The Flue `Writer` agent now omits `## Style:` and a second title, but it still does not call `streamChat`, so items 1–4 and 6 do not apply on that path. Items 7–9 stay out.

### Phase 2: fact-check and citations

1. Add a `factcheck` stage to `WRITE_STAGES` in `src/contract.ts` and to the form's stage list.
2. Split the draft into claims. Match each claim to a note excerpt and its URL, using a model other than the writer's.
3. Cut or flag unsupported claims. Emit a source list and inline citations.
4. Offer `haimaker/auto` in the picker (moved from Phase 0: it errors when the key has no router, and stage routing needs the prompt change below). Show the routed model per stage from the response `model` field. An earlier step is a router with only a default model and no stage rules.
5. Route stages through a repo-managed auto router. Move notes and drafts into the system message, and make each stage's user message a short instruction. Keep the router definition (default model, one rule per stage with 3–10 example instructions, target models, `capture_enabled`, `auto_apply_enabled`) in a versioned file. Apply it with the Management API, and check it with `/auto-router/{id}/simulate` in verification.
6. Use `response_format` `json_schema` for the outline instead of parsing JSON out of free text.
7. Order prompts so the notes are a shared prefix, for prompt caching. Add `cache_control` for Anthropic models, and report `cached_tokens`.
8. Test native reasoning controls: Gemini `thinkingConfig` through `/v1beta/models/{model}:generateContent` (the HaiMaker page does not mention `thinkingConfig`), and Anthropic `thinking` through `/v1/messages`.

### Phase 3: brief, packaging, approval

1. A brief: angle, audience, purpose and length, with the word count taken from the brief rather than the topic text. Include first-hand material the web cannot supply ("my pet cat").
2. A headline and standfirst stage.
3. Human approval after the outline and before publishing, in the form.
4. Saved versions and an AI-assistance disclosure line.
5. Per-stage spend reporting from `/spend/logs/v2`, and a review of auto-router proposals (`/proposals?status=pending`) before accepting mined rules.

## Alternatives considered

- **Keep three drafts and have a model pick the best.** This gives real comparison, but costs three draft calls plus a judge. Deferred until the fact-check exists to score drafts.
- **Fact-check with lexical overlap only.** Cheap, but it cannot tell a supported claim from a reworded contradiction.
- **Remove reasoning models from the picker.** Simple, but it hides useful models. Per-model reasoning settings plus cost display keep them usable.
- **Raise `max_tokens` so reasoning models finish.** It avoids truncation, but pays for more hidden reasoning. The pet-cat run already cost 50x a Flash Lite run.
- **Use `haimaker/auto` as the only model.** It needs less code, but routing by stage needs the prompt restructuring above first, and cost is only known after each call.
- **Rely on key budgets for per-run limits.** Rejected: `max_budget` is a ceiling on the key, not a limit per run. The per-run bound is the call caps in Phase 0 items 1 and 4.
- **Actual cost from `/key/info` before and after, or a time window of spend logs.** Rejected: both mix overlapping runs. Tag calls with `user` instead.
- **Compute authoritative cost from catalog prices.** Rejected: HaiMaker says catalog prices are reference prices, and billing is authoritative. Catalog prices are for estimates only.
- **Turn off reasoning with undocumented `reasoning_effort` values (`none`, `minimal`).** Rejected: not in the HaiMaker contract, and the results differ by model.
- **Replace Tavily with HaiMaker web search.** Rejected for the notes: the documented output is a model answer with no documented citations, which the notes-only rule forbids. A fact-check use stays open (see open questions).

## Open questions

- Should the fact-checker cut unsupported claims itself, or flag them for a person?
- What citation format suits the target publications: inline links, footnotes, or a source list?
- Where does human approval live for the CLI: an interactive prompt or a saved draft to approve later?
- Does length fitting belong in the line edit (cut to fit) or in the structural edit?
- For HaiMaker support: should truncated reasoning ever appear in `content` rather than `reasoning_content`, as it did in the pet-cat run? (Not blocking: Phase 0 rejects `length`.)
- Does the request `user` land in spend-log `end_user`, and does `/spend/logs/v2?end_user=` filter by it? (Blocks only the actual-cost half of Phase 0 item 5; the estimate can ship. Verify with one tagged call.)
- Does HaiMaker pass Gemini `thinkingConfig` through `generateContent`, and Anthropic `thinking` through `/v1/messages`?
- Should HaiMaker web search be allowed for fact-check lookups only (never as notes)? This needs the `AGENTS.md` research rules changed, and a check of whether search responses include citations.
- Which target model should each stage's router rule use, and should `capture_enabled` and `auto_apply_enabled` stay on?
- What `max_budget`, `budget_duration`, and `soft_budget` suit the writer's service account key?
