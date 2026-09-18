# Flue Writing Agent - Professional Edition

Structured writing workflow with multi-provider support, style profiles, and CLI options.

## Quick Start

The test form is a Fresh app. The Flue agent is the `flue run` command below.

```bash
deno task dev
```

Open http://127.0.0.1:5175. Choose a style, then write. Port 5175 stays fixed.

```bash
npx flue run src/agents/writer.ts --data '{"style":"economist"}' --message "Write a 900 word blog post about pet cats."
```

Mercury uses `FAST_MODEL_KEY` already in `.env`. Do not print that key.

The older five-call script is gone from `deno task start`; that task now calls `writeWithFlue`. `deno task write` is the same CLI. Fresh production is `deno task build` then `deno task serve`.

## CLI Options

```bash
deno task start "<topic>" [options]

Options:
  --provider <name>   Provider: haimaker, mercury
  --model <id>        Model id, e.g. anthropic/claude-haiku-4-5 (HaiMaker)
  --check-model <id>  Optional critic model (default google/gemini-3.5-flash)
  --style <name>      Style: economist, strunk-white, monocle, professional
  --format <fmt>      Output: markdown, json, plain
  --verbose           Show detailed progress
  --dry-run           Show config without running

Length defaults to 900 words. Put a count in the topic (`200 words`) to override. The saved essay must be at least 85% of that count and at most 115%, excluding the Sources list. Plan and draft are told that range. A miss is an error. The body word count is written under the title.
```

**Examples:**

```bash
deno task start "AI agent frameworks" --style economist --format json --verbose
deno task start "Climate policy" --provider haimaker --model openai/gpt-4.1 --style professional
deno task start "Testing" --dry-run
```

## Provider Configuration

The agent supports seamless provider switching via environment variables:

```bash
# Mercury
export FAST_PROVIDER=mercury
export FAST_MODEL_ID=hermes-3-70b
export FAST_MODEL_KEY=...

# HaiMaker. The code reads HAIMAKER_API_KEY, not FAST_MODEL_KEY.
# Do not set FAST_MODEL_ID=haimaker/auto. That model errors until a router is assigned.
export HAIMAKER_API_KEY=...
export HAIMAKER_MODEL_ID=anthropic/claude-sonnet-5
# Optional critic model. Default is google/gemini-3.5-flash, never the writer.
# export CHECK_MODEL=
```

HaiMaker spend is bounded by the key, not by this app. Use a service account key and set `max_budget`, `budget_duration`, and `soft_budget` there. `soft_budget` alerts and does not block. Set `models` to the picker list. `model_max_budget` is optional.

See `.env.example` for complete provider options.

## Style Profiles

| Profile        | Use Case                           |
|----------------|------------------------------------|
| economist      | Direct, active voice, no hedging   |
| strunk-white   | Formal, precise, omit needless words|
| monocle        | Optimistic, solutions-oriented     |
| professional   | Formal, objective, business tone   |

## Architecture

A [Flue workflow](https://flueframework.com/docs/guide/workflows/) here is `writeWithFlue` (`start` / `init` / `dispatch` / `read`) or `flue run src/agents/writer.ts`. The UI is Fresh on Deno.

```
src/
├── agents/
│   ├── writer.ts    # Flue agent: research, draft, save_essay (critique inside save)
│   ├── run.ts       # writeWithFlue
│   └── write.ts     # plan/draft helpers
├── output.ts        # slug, unused path, disk + KV writes
├── essay_kv.ts      # Deno KV blobs for essays
├── main.ts          # deno task start → writeWithFlue
├── notes.ts         # Tavily
├── cite.ts          # Layer 1 harness
├── critic.ts        # RFC 0003 rubric
├── providers.ts     # WRITER_OPTIONS
└── skills/
    └── styles.ts
```

## Features

- **Attributed notes**: The topic is the brief. Research searches the subject plus the claim, then a counter-search, then extracts full articles. Notes keep id, URL, author, outlet, date, stance, and quotes. The outlet must match the URL's domain. Content farms are blocked. Writers see that attribution. The brief's audience, purpose, tone, and constraints outrank stage defaults. Do not invent statistics, studies, quotes, or sources. Do not paste a call to action or a URL into the essay body
- **Writer**: The form offers three writer radios (Claude Sonnet 5 by default, Gemini 3.1 Flash Lite, Mercury 2.5). That model, or `--model`, runs notes, plan, and draft. The critic is Gemini 3.5 Flash. `--check-model` or `CHECK_MODEL` may pick another HaiMaker id; it is never the writer
- **Style**: The catalog shapes draft wording. It is not a rewrite pass
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Essay stages

These are what `Writer` does on a run. They are not a Flue workflow. The workflow is the program that `dispatch`es the agent ([above](#architecture)).

1. **Brief**: Parse audience, purpose, tone, claim, and constraints from the topic. Fall back to the topic text if the parse fails
2. **Research**: Tavily search on the subject plus the claim, plus a counter-search. Extract the top articles in full. No synthesized answer. If extract fails, use search snippets. If search fails with HTTP 401, 403, 429, or 432, stop searching, keep that error on the job, and draft from the brief. Otherwise re-query toward the source floor. Below the floor after re-query, still plan and draft from the brief; do not invent figures or quotes
3. **Notes**: One model turn turns each article into structured notes with attribution
4. **Plan**: Map each section to note ids, at most three sections for a 500-word essay. Name counter-arguments and gaps. Do not label Introduction or Conclusion
5. **Draft**: The Writer `draft` tool writes one essay from the plan, paraphrasing, citing `[n3]`. Quoted words stay under 15% of the body. If it is short, one expand pass fills thin sections from notes already in the plan. If it is long, one shorten pass cuts filler
6. **Critic**: Gemini 3.5 Flash, via the Writer's `critique` tool, is the editor: it judges the RFC 0003 rubric, receives the plan, and rewrites named passages on the writer model. Architecture briefs fail when a mechanism has no operational bound, when the bound is a sibling failure mode or a menu of options, or when the essay answers a different bound than the plan named. Empty notes still require an answered objection. The harness rejects uncited figures and quotes, missing note ids, unquoted copying, and a quote share over 15%. Critic issues and harness findings merge. `save_essay` runs that critique if the agent skipped it. The critic sidecar is the editorial assessment. Leftover copied phrases are quoted in place only under the quote budget. Leftover Layer 1, length, or plan-bound problems still write the file and record the error unless `keepOnFail`
7. **Save**: Print the essay, write `output/<slug>.md` plus `output/<slug>.notes.md`, and store the same bodies in Deno KV. Strip links, URLs, and calls to action from the body. `## Sources` lists cited notes. No `## Style:` line in the essay

`deno task eval` runs the four RFC 0003 briefs and prints the pass/fail table. Essays land in `evals/out/` and in Deno KV.

## Deno Deploy

Link the GitHub repo, pick the Fresh preset, and attach a Deno KV database. Set `HAIMAKER_API_KEY` (and optional `TAVILY_API_KEY`, `FAST_MODEL_KEY`, `CHECK_MODEL`) in the dashboard. Do not set `ESSAY_KV_PATH` or `FRESH_PUBLIC_` keys. Entrypoint after `deno task build` is `_fresh/server.js`. Fresh is Vite 7; Vite 8 cannot build this app. CI is `deno task ci` (test, lint, build, then a GET of `/` and the CSS). Local CLI still uses `deno task start` and writes `output/` plus `data/essays.kv`. On Deploy, essays go to the attached KV and Flue sqlite uses `/tmp/flue.db`.

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
