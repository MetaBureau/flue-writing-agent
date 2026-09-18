/// <reference lib="deno.ns" />
import { EVAL_BRIEFS } from "./briefs.ts";
import { formatTable, scoreEssay, type EvalRow } from "./score.ts";
import { writeWithFlue } from "../src/agents/run.ts";

const OUT_DIR = "evals/out";

async function runBrief(
  brief: (typeof EVAL_BRIEFS)[number],
): Promise<EvalRow> {
  console.log(`\n=== ${brief.title} (${brief.id}) ===`);
  try {
    const result = await writeWithFlue({
      topic: brief.text,
      style: "professional",
      provider: "haimaker",
      model: "anthropic/claude-sonnet-5",
      words: brief.words,
      outDir: OUT_DIR,
      keepOnFail: true,
    });
    console.log(`saved ${OUT_DIR}/${result.slug}.md`);
    return scoreEssay({
      brief: brief.id,
      essay: result.markdown,
      notes: result.notes,
      articles: result.articles,
      target: result.target,
      briefText: result.brief.text,
      rubric: result.review.rubric,
      cost: result.cost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    console.log(`[error] ${message}`);
    return scoreEssay({
      brief: brief.id,
      essay: "",
      notes: [],
      articles: [],
      target: brief.words,
      briefText: brief.text,
      rubric: [],
      cost: "failed",
    });
  }
}

if (import.meta.main) {
  const rows: EvalRow[] = [];
  for (const brief of EVAL_BRIEFS) {
    rows.push(await runBrief(brief));
  }
  const table = formatTable(rows);
  console.log(`\n${table}\n`);
  await Deno.mkdir(OUT_DIR, { recursive: true });
  await Deno.writeTextFile(`${OUT_DIR}/table.txt`, `${table}\n`);
  const failed = rows.filter((row) => !row.pass).length;
  if (failed > 0) Deno.exit(1);
}
