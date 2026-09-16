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
# Mercury (default for reasoning)
export FAST_PROVIDER=mercury
export FAST_MODEL_ID=hermes-3-70b
export FAST_MODEL_KEY=...

# Or HaiMaker (recommended for fast drafts)
export FAST_PROVIDER=haimaker
export FAST_MODEL_ID=haimaker/auto
export FAST_MODEL_KEY=...
```

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
- **Dual-Model**: Fast model for drafts, reasoning model for outline
- **Style Enforcement**: Apply editorial rules (Economist, Strunk & White, Monocle, Professional)
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Workflow

1. **Research**: Tavily search for page excerpts. No synthesized answer. If the call fails, continue with the topic only
2. **Notes**: The topic string plus those excerpts
3. **Outline**: Generate a structured outline with the reasoning model
4. **Draft**: Write conversational, professional, and analytical drafts
5. **Select**: Keep the draft voice that matches `--style`
6. **Style pass**: Rewrite the selected draft. Cut praise, repetition, ads, and biographies. Keep names, numbers, and URLs
7. **Extend**: Add unused on-topic facts until the word floor. Stop when an expansion repeats the draft
8. **Save**: Print the essay and write `output/<slug>.md`

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
