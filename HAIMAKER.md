# Haimaker Configuration Guide

## What is Haimaker?

Haimaker is an emerging model API provider. Before integrating, verify:

1.  **API compatibility**: Does it support OpenAI-style `/v1/chat/completions`?
2.  **Model catalog**: What LLMs does it offer?
3.  **Pricing**: Per-token costs and rate limits.

## Testing Setup

```bash
# Set Haimaker credentials
export FAST_PROVIDER=haimaker
export FAST_MODEL_URL=https://api.haimaker.ai/v1
export FAST_MODEL_ID=your-fast-model-id             # Replace with actual model ID
export FAST_MODEL_KEY=your-api-key

export REASONING_PROVIDER=haimaker
export REASONING_URL=https://api.haimaker.ai/v1
export REASONING_MODEL_ID=your-reasoning-model-id   # Replace with actual model ID
export REASONING_MODEL_KEY=your-api-key
```

## First Test

```bash
cd ~/workspaces/MetaBureau/metabureau-com-au_2026/flue-writing-agent
deno task start "parallel token generation"
```

## Debugging

If you get errors, check:

1.  **API format**: Haimaker may use a different request body than OpenAI
2.  **Authentication**: Verify your API key format (Bearer token? Query param?)
3.  **Model availability**: Confirm the model ID exists in Haimaker's catalog

## Fallback to OpenRouter

To revert if Haimaker doesn't work:

```bash
# Clear Haimaker vars and use OpenRouter defaults
unset FAST_PROVIDER FAST_MODEL_URL FAST_MODEL_ID FAST_MODEL_KEY
unset REASONING_PROVIDER REASONING_URL REASONING_MODEL_ID REASONING_MODEL_KEY
deno task start "your topic"
```

## Next Steps

1.  **Get API access**: Sign up at Haimaker's dashboard
2.  **Find model IDs**: Check their documentation or API list endpoint
3.  **Test**: Run the writing workflow with Haimaker
4.  **Compare**: Compare output quality vs. OpenRouter/Together
