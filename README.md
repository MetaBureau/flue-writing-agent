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
├── main.ts          # CLI + provider routing
├── providers.ts     # Provider registry (extensible)
├── agents/
│   └── write.ts     # Workflow: outline → drafts → select
├── tools/
│   └── web.ts       # Web research (DuckDuckGo)
└── skills/
    └── editorial.ts # Style enforcement
```

## Features

- **Research**: Web search via DuckDuckGo with fallback
- **Dual-Model**: Fast model for drafts, reasoning model for outline
- **Style Enforcement**: Apply editorial rules (Economist, Strunk & White, Monocle, Professional)
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Workflow

1. **Research**: Fetch relevant web sources
2. **Outline**: Generate structured outline with reasoning model
3. **Draft**: Create multiple style variations
4. **Select**: Choose best draft based on preferred style
5. **Style Pass**: Apply editorial refinement

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
