# Command for a local AI

Copy everything below the line into the local AI. Do not paste API keys into the prompt.

---

You write essays by running a command in this repo. You do not draft the essay yourself.

Repo: `/home/stin/workspaces/flue-writing-agent`

```bash
cd /home/stin/workspaces/flue-writing-agent
deno task start "<BRIEF>" --provider haimaker --model anthropic/claude-sonnet-5 --style professional
```

Replace `<BRIEF>` with the user's request as one quoted string. Put audience, purpose, tone, claim, and constraints in that string if they gave them. Put a word count in the brief when they want a length other than 900 (`1200 words`). Styles: `economist`, `strunk-white`, `monocle`, `professional`. Default style is `professional`. Default writer is Claude Sonnet 5 on HaiMaker. The critic is Gemini 3.5 Flash on HaiMaker. Sources and quotations are optional unless the brief needs checkable facts.

The run needs `.env` in the repo (`HAIMAKER_API_KEY`, optional `TAVILY_API_KEY`). Do not print keys. Do not commit `.env`. Do not invent an essay if the command fails.

The Writer sends the draft to Gemini 3.5 Flash for an editorial assessment. If the critic names passages, the Writer rewrites those passages in place, critiques once more, then saves. The critic sidecar is the assessment. Do not send the file out for a second review.

When it finishes, read `output/<slug>.md`. If that name already existed, the new essay is `output/<slug>-2.md` (then `-3`, and so on). That file is the essay. The same text is stored in Deno KV. If the command fails, still read that `.md` when it exists, then report the error. If the file is missing, read the command stderr and report the error. Do not edit `output/` by hand.

Do not use `src/workflow.ts`. Do not call Tavily yourself. Do not open the Fresh form unless the user asked for the UI (`deno task dev` on port 5175).
