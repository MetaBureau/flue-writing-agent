# HaiMaker

Operator notes. Not runtime.

The form and `deno task start --provider haimaker` call `https://api.haimaker.ai/v1/chat/completions` with `Authorization: Bearer` and `HAIMAKER_API_KEY`. Do not put that key in `FAST_MODEL_KEY`.

```bash
export HAIMAKER_API_KEY=...
export HAIMAKER_BASE_URL=https://api.haimaker.ai/v1
export HAIMAKER_MODEL_ID=google/gemini-3.1-flash-lite
deno task start "a topic" --provider haimaker --model google/gemini-3.1-flash-lite
```

`haimaker/auto` is not a picker model. A key with no router returns an error for that id.

The picker ids stay in `src/providers.ts`. Labels, prices, and `supports_reasoning` come from `GET /public/model_hub` when that call succeeds. A key's `GET /v1/models` list narrows the picker when the key is set.

Key budgets are set on the HaiMaker key, not in this repo. Use a service account key. Set `max_budget`, `budget_duration`, `soft_budget`, and a models allowlist. See `.env.example` and https://docs.haimaker.ai/docs/key_management.

Do not commit a live key.
