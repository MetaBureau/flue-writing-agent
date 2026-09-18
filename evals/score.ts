import { bodyWordCount } from "../src/agents/write.ts";
import {
  citedNoteIds,
  LAYER1_IDS,
  layer1Score,
  type Layer1Score,
  quoteShare,
} from "../src/cite.ts";
import {
  RUBRIC_IDS,
  type RubricItem,
} from "../src/critic.ts";
import type { Article, SourceNote } from "../src/notes.ts";

export interface EvalRow {
  brief: string;
  words: number;
  quotedPct: number;
  notesCited: number;
  layer1: Layer1Score;
  rubric: RubricItem[];
  cost: string;
  pass: boolean;
}

export function scoreEssay(input: {
  brief: string;
  essay: string;
  notes: readonly SourceNote[];
  articles: readonly Article[];
  target: number;
  briefText: string;
  rubric: readonly RubricItem[];
  cost: string;
}): EvalRow {
  const layer1 = layer1Score(
    input.essay,
    input.notes,
    input.articles,
    input.target,
    input.briefText,
  );
  const rubric = [...input.rubric];
  const pass = LAYER1_IDS.every((id) => layer1[id]) &&
    RUBRIC_IDS.every((id) => rubric.find((item) => item.id === id)?.pass);
  return {
    brief: input.brief,
    words: bodyWordCount(input.essay),
    quotedPct: Math.round(quoteShare(input.essay) * 1000) / 10,
    notesCited: citedNoteIds(input.essay).length,
    layer1,
    rubric,
    cost: input.cost,
    pass,
  };
}

function cell(ok: boolean): string {
  return ok ? "pass" : "FAIL";
}

export function formatTable(rows: readonly EvalRow[]): string {
  const headers = [
    "brief",
    "words",
    "quoted%",
    "cited",
    ...LAYER1_IDS,
    ...RUBRIC_IDS,
    "cost",
    "result",
  ];
  const body = rows.map((row) => [
    row.brief,
    String(row.words),
    `${row.quotedPct}%`,
    String(row.notesCited),
    ...LAYER1_IDS.map((id) => cell(row.layer1[id])),
    ...RUBRIC_IDS.map((id) =>
      cell(row.rubric.find((item) => item.id === id)?.pass !== false)
    ),
    row.cost,
    row.pass ? "pass" : "FAIL",
  ]);
  const width = headers.map((header, index) =>
    Math.max(header.length, ...body.map((line) => line[index]?.length ?? 0))
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(width[index] ?? 0)).join("  ");
  const rule = width.map((size) => "-".repeat(size)).join("  ");
  return [line(headers), rule, ...body.map(line)].join("\n");
}
