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

The older five-call script is still `deno task start "<topic>"`.

## CLI Options

```bash
deno task start "<topic>" [options]

Options:
  --provider <name>   Provider: haimaker, mercury
  --model <id>        Model id, e.g. anthropic/claude-haiku-4-5 (HaiMaker)
  --check-model <id>  HaiMaker model for fact-check (default openai/gpt-4.1)
  --style <name>      Style: economist, strunk-white, monocle, professional
  --format <fmt>      Output: markdown, json, plain
  --verbose           Show detailed progress
  --dry-run           Show config without running

Length defaults to 900 words. Put a count in the topic (`200 words`) to override.
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
export HAIMAKER_MODEL_ID=google/gemini-3.1-flash-lite
# Fact-check. Separate from the writer. Catalog marks GPT-4.1 as unable to reason.
export CHECK_MODEL=openai/gpt-4.1
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

```
src/
├── main.ts          # CLI, then write the essay to output/
├── complete.ts      # Streaming chat completion
├── research.ts      # Tavily search, excerpts only, no synthesized answer
├── providers.ts     # Provider registry
├── agents/
│   └── write.ts     # Outline, three drafts, style pick
└── skills/
    └── editorial.ts # Style pass
```

## Features

- **Topic notes**: The topic string plus Tavily page excerpts. Prompts forbid extra sections, and an expansion is rejected if it is not about its note
- **Writer and checker**: The form and `--model` run the writing stages on one model. Fact-check uses `CHECK_MODEL` or the form's checker, default `openai/gpt-4.1`, through `HAIMAKER_API_KEY`. Without that key, fact-check is skipped and the essay is still saved. Unsupported claims stay in the notes file, not the essay
- **Style Enforcement**: Apply editorial rules (Economist, Strunk & White, Monocle, Professional)
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Workflow

1. **Research**: Tavily search for page excerpts. No synthesized answer. If the call fails, continue with the topic only
2. **Notes**: The topic string plus those excerpts
3. **Outline**: Generate a structured outline with the chosen model
4. **Draft**: Write conversational, professional, and analytical drafts
5. **Select**: Keep the draft voice that matches `--style`
6. **Extend**: Add unused on-topic facts from notes that are not about the source page. Stop when those notes are gone, not by looping until the word floor
7. **Style pass**: Rewrite the extended draft. Cut praise, repetition, ads, and biographies. Keep names, numbers, and URLs
8. **Fact-check**: Match claims to note URLs with a different model when one is configured. Cite supported claims. Flag unsupported claims. Do not cut them
9. **Save**: Print the essay and write `output/<slug>.md` plus `output/<slug>.notes.md` (notes, model, estimate). No `## Style:` line in the essay

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
