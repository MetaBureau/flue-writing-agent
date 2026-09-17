/// <reference lib="deno.ns" />
import { EVAL_BRIEFS } from "./briefs.ts";
import { formatTable, scoreEssay, type EvalRow } from "./score.ts";
import { topicSlug } from "../src/output.ts";
import { writeStages, type WriteJobResult } from "../src/workflow.ts";

const OUT_DIR = "evals/out";

async function runBrief(
  brief: (typeof EVAL_BRIEFS)[number],
): Promise<EvalRow> {
  const slug = topicSlug(brief.text);
  console.log(`\n=== ${brief.title} (${brief.id}) ===`);
  const iter = writeStages({
    topic: brief.text,
    style: "professional",
    provider: "haimaker",
    model: "anthropic/claude-sonnet-5",
    words: brief.words,
    outDir: OUT_DIR,
    keepOnFail: true,
  });
  let result: WriteJobResult | undefined;
  while (true) {
    const step = await iter.next();
    if (step.done) {
      result = step.value;
      break;
    }
    const event = step.value;
    if (event.type === "stage") {
      const detail = event.detail ? ` ${event.detail}` : "";
      console.log(`[${event.id}] ${event.status}${detail}`);
    }
    if (event.type === "error") {
      console.log(`[error] ${event.stage}: ${event.error}`);
    }
  }
  if (!result) {
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
  console.log(`saved ${OUT_DIR}/${slug}.md`);
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
