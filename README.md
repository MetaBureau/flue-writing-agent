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
  --check-model <id>  HaiMaker model for fact-check (default google/gemini-3.1-flash-lite)
  --style <name>      Style: economist, strunk-white, monocle, professional
  --format <fmt>      Output: markdown, json, plain
  --verbose           Show detailed progress
  --dry-run           Show config without running

Length defaults to 900 words. Put a count in the topic (`200 words`) to override. The saved essay must be at least 85% of that count and at most 115%, excluding the Sources list. Merge, extend, and style are told that range. A longer piece is trimmed from the body, keeping the opening and the close. The body word count is written under the title.
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
# Fact-check. Separate from the writer. Default is Gemini 3.1 Flash Lite.
export CHECK_MODEL=google/gemini-3.1-flash-lite
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
├── providers.ts     # Provider registry and DRAFT_MODELS
├── agents/
│   └── write.ts     # Outline, parallel drafts, synthesis, extend
└── skills/
    └── editorial.ts # Style pass
```

## Features

- **Topic notes**: The topic is the brief. Research searches the subject plus the claim and returns page excerpts. Prompts treat notes as the source for specifics; argument and general knowledge are allowed. The brief's audience, purpose, tone, and constraints outrank stage defaults. Do not invent statistics, studies, quotes, or sources. Do not paste a call to action or a URL into the essay body
- **Writer and checker**: The form and `--model` run outline, extend, and style. Three HaiMaker models draft in parallel. Mercury 2.5 synthesizes. Fact-check uses `CHECK_MODEL` or the form's checker, default `google/gemini-3.1-flash-lite`, through `HAIMAKER_API_KEY`. It may match the writer. If that id is one of the three drafters, the checker falls back to the default. Without a HaiMaker key, fact-check is skipped and the essay is still saved. Unsupported claims stay in the notes file; argument and general knowledge are `not-a-claim` and are not listed
- **Style Enforcement**: Apply editorial rules (Economist, Strunk & White, Monocle, Professional)
- **Provider Abstraction**: Unified interface for any OpenAI-compatible API (HaiMaker, Mercury)
- **Output Formatting**: Markdown, JSON, or plain text
- **Verbose Mode**: Detailed progress logging for debugging

## Workflow

1. **Brief**: Parse audience, purpose, tone, claim, and constraints from the topic. Fall back to the topic text if the parse fails
2. **Research**: Tavily search for page excerpts on the subject plus the claim, not the writing instruction. No synthesized answer. If the call fails, continue with the topic only
3. **Notes**: The topic string plus those excerpts
4. **Outline**: Generate a structured outline with the chosen model. The brief governs audience, purpose, and tone
5. **Draft**: Write three HaiMaker drafts in parallel (Claude Haiku 4.5, Mistral Large 2512, Kimi K2 0905), or one writer draft if there is no HaiMaker key
6. **Synthesis**: Mercury 2.5 merges the drafts, or the writer if there is no Mercury key, or the longest draft if synthesis is empty. Repetition is a fault. A longest-draft fallback is a warning
7. **Extend**: Add unused on-topic facts from notes that are not about the source page. Stop when those notes are gone, not by looping until the word floor
8. **Style pass**: Rewrite the extended draft into one essay. The preset controls wording. It must not change the brief's tone, purpose, or humour. Cut empty praise and filler. Keep humour the brief asks for
9. **Brief check**: The checker is told the measured word count and does not judge length. It judges audience, purpose, tone, claim, and constraints. Amusement needs actual wit, not just an elevated tone. It also fails pasted source text, a body link or URL, a call to action, and a stretch that does not serve the claim. One Mercury revision if it fails. The revision cuts repetition. Skip is a warning
10. **Fact-check**: Match checkable specifics to note URLs. The checker returns a claim number, not the claim text, in batches of about 25. Cite supported claims. Flag unsupported claims. Skip argument and general knowledge (`not-a-claim`). Do not cut them
11. **Save**: Print the essay and write `output/<slug>.md` plus `output/<slug>.notes.md` (notes, brief, models, estimate). Strip links, URLs, and calls to action from the body. Keep `## Sources` links. No `## Style:` line in the essay

## Security

**Never commit API keys**. Use `.env` or environment variables.
`env.example` contains safe defaults for reference.

## Next Steps

- Add local caching to reduce API costs
- Support streaming output for better UX
- Add webhook integration for CI/CD triggers
- Integrate with vector search for knowledge retrieval
