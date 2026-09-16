# Flue Writing Agent - Professional Edition

Structured writing workflow with multi-provider support, style profiles, and CLI options.

## Quick Start

```bash
# Setup (HaiMaker is now default)
cp .env.example .env
# Edit .env with your API keys
deno task start "your topic"
```

## CLI Options

```bash
deno task start "<topic>" [options]

Options:
  --provider <name>   Provider: haimaker, mercury, openrouter, together
  --style <name>      Style: economist, strunk-white, monocle, professional
  --format <fmt>      Output: markdown, json, plain
  --verbose           Show detailed progress
  --dry-run           Show config without running
```

**Examples:**

```bash
deno task start "AI agent frameworks" --style economist --format json --verbose
deno task start "Climate policy" --provider together --style professional
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
├── providers.ts     # Provider registry
├── agents/
│   └── write.ts     # Outline, three drafts, style pick
└── skills/
    └── editorial.ts # Style pass
```

## Features

- **Topic notes**: Outlines and drafts use the CLI topic string as the only source material
- **Dual-Model**: Fast model for drafts, reasoning model for outline
- **Style Enforcement**: Apply editorial rules (Economist, Strunk & White, Monocle, Professional)
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Workflow

1. **Notes**: The topic string is the only source
2. **Outline**: Generate a structured outline with the reasoning model
3. **Draft**: Write conversational, professional, and analytical drafts
4. **Select**: Keep the draft voice that matches `--style`
5. **Style pass**: Apply the editorial sample
6. **Save**: Print the essay and write `output/<slug>.md`

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
