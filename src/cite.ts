import { bodyWordCount, isCallToAction } from "./agents/write.ts";
import {
  essayLengthCeiling,
  essayLengthFloor,
} from "./contract.ts";
import type { Article, SourceNote } from "./notes.ts";

export const COPY_NGRAM = 8;
export const QUOTE_BUDGET = 0.15;
const STOP_WORDS = new Set(
  "the a an and or of to in on for with from that this these those was were been being have has had not but its their they them you your only into via by as at than then also when while"
    .split(" "),
);

export function citedNoteIds(essay: string): string[] {
  const ids = essay.match(/\[n\d+\]/g) ?? [];
  return [...new Set(ids.map((id) => id.slice(1, -1)))];
}

export function noteById(
  notes: readonly SourceNote[],
  id: string,
): SourceNote | undefined {
  return notes.find((note) => note.id === id);
}

export function sourcesMarkdown(
  notes: readonly SourceNote[],
  essay: string,
): string {
  const cited = citedNoteIds(essay);
  const used = cited
    .map((id) => noteById(notes, id))
    .filter((note): note is SourceNote => Boolean(note));
  if (used.length === 0) return "";
  const lines = used.map((note) => {
    const label = note.outlet || note.title;
    return `- [${note.id}] [${label}](${note.url})`;
  });
  return `## Sources\n\n${lines.join("\n")}`;
}

export function withSources(
  essay: string,
  notes: readonly SourceNote[],
): string {
  const prose = essay.replace(/\n## Sources\s*\n[\s\S]*$/, "").trim();
  const sources = sourcesMarkdown(notes, prose);
  return sources ? `${prose}\n\n${sources}` : prose;
}

function sentencesOf(text: string): string[] {
  const prose = text.replace(/\n## Sources\s*\n[\s\S]*$/, "").trim();
  return prose
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      sentence.length > 0 &&
      !sentence.startsWith("#") &&
      !/^\d+ words\.?$/i.test(sentence)
    );
}

export function quotedSpans(essay: string): string[] {
  const spans: string[] = [];
  const pattern = /"([^"]+)"|\u201c([^\u201d]+)\u201d|\u2018([^\u2019]+)\u2019/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(essay))) {
    const span = match[1] ?? match[2] ?? match[3] ?? "";
    if (span.trim()) spans.push(span);
  }
  return spans;
}

export function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean);
}

function ngrams(words: readonly string[], size: number): string[] {
  if (words.length < size) return [];
  const grams: string[] = [];
  for (let index = 0; index <= words.length - size; index++) {
    grams.push(words.slice(index, index + size).join(" "));
  }
  return grams;
}

function distinctiveWordCount(gram: string): number {
  return gram.split(" ").filter((word) =>
    word.length > 3 && !STOP_WORDS.has(word)
  ).length;
}

const FIGURE =
  /(?:\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b)/g;

function hasCitation(sentence: string): boolean {
  return /\[n\d+\]/.test(sentence);
}

function notesBlob(notes: readonly SourceNote[]): string {
  return notes.map((note) =>
    [
      note.date,
      note.stance,
      ...note.claims.map((claim) => `${claim.claim} ${claim.quote}`),
    ].join(" ")
  ).join(" ");
}

function isYearFigure(figure: string): boolean {
  return /^(?:19|20)\d{2}$/.test(figure);
}

function textHasYear(text: string, year: string): boolean {
  return new RegExp(`\\b${year}\\b`).test(text);
}

export function figureNeedsCite(
  figure: string,
  notes: readonly SourceNote[],
  brief = "",
): boolean {
  if (!isYearFigure(figure)) return true;
  if (textHasYear(brief, figure)) return false;
  return notesBlob(notes).includes(figure);
}

export function citationProblems(
  essay: string,
  notes: readonly SourceNote[],
  brief = "",
): string[] {
  if (notes.length === 0) return [];
  const known = new Set(notes.map((note) => note.id));
  const problems: string[] = [];
  for (const id of citedNoteIds(essay)) {
    if (!known.has(id)) {
      problems.push(`citation [${id}] does not match a note`);
    }
  }
  for (const sentence of sentencesOf(essay)) {
    const quotes = quotedSpans(sentence).filter((span) =>
      normalizeWords(span).length >= 5
    );
    for (const quote of quotes) {
      if (!hasCitation(sentence)) {
        problems.push(`quote has no citation: ${quote.slice(0, 80)}`);
      }
    }
    const figures = sentence.match(FIGURE) ?? [];
    for (const figure of figures) {
      if (!hasCitation(sentence) && figureNeedsCite(figure, notes, brief)) {
        problems.push(`figure ${figure} has no citation`);
      }
    }
  }
  return [...new Set(problems)];
}

export function copyProblems(
  essay: string,
  articles: readonly Article[],
  size = COPY_NGRAM,
): string[] {
  const body = stripQuotedSpans(
    essay.replace(/\n## Sources\s*\n[\s\S]*$/, ""),
  );
  const essayGrams = new Set(ngrams(normalizeWords(body), size));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const article of articles) {
    for (const gram of ngrams(normalizeWords(article.text), size)) {
      if (
        !essayGrams.has(gram) || seen.has(gram) ||
        distinctiveWordCount(gram) < 3
      ) {
        continue;
      }
      seen.add(gram);
      problems.push(
        `copied without quotes from ${article.title}: ${gram}`,
      );
      if (problems.length >= 20) return problems;
    }
  }
  return problems;
}

function stripQuotedSpans(text: string): string {
  return text.replace(/"([^"]*)"|\u201c([^\u201d]*)\u201d|\u2018([^\u2019]*)\u2019/g, " ");
}

export function copiedGramFromProblem(problem: string): string | undefined {
  const match = problem.match(/^copied without quotes from [^:]+: (.+)$/);
  return match?.[1]?.trim() || undefined;
}

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wrapGram(essay: string, gram: string): string {
  const words = gram.split(/\s+/).filter(Boolean);
  if (words.length < COPY_NGRAM) return essay;
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])(${words.map(escapeRegex).join("[^A-Za-z0-9]+")})(?![A-Za-z0-9])`,
    "i",
  );
  const match = pattern.exec(essay);
  if (!match || match.index === undefined) return essay;
  if (quotedAt(essay, match.index)) return essay;
  return `${essay.slice(0, match.index)}"${match[0]}"${
    essay.slice(match.index + match[0].length)
  }`;
}

function quotedAt(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  return ((before.match(/"/g) ?? []).length % 2) === 1 ||
    ((before.match(/\u201c/g) ?? []).length >
      (before.match(/\u201d/g) ?? []).length);
}

export function quoteCopiedPhrases(
  essay: string,
  articles: readonly Article[],
): string {
  let next = essay;
  for (let i = 0; i < 20; i++) {
    const problems = copyProblems(next, articles);
    if (problems.length === 0) return next;
    const gram = copiedGramFromProblem(problems[0]);
    if (!gram) return next;
    const wrapped = wrapGram(next, gram);
    if (wrapped === next) return next;
    if (quoteShare(wrapped) > QUOTE_BUDGET) return next;
    next = wrapped;
  }
  return next;
}

function bodyText(essay: string): string {
  return essay
    .replace(/\n## Sources\s*\n[\s\S]*$/, "")
    .replace(/^\uFEFF?\s*# [^\n]*\n*/, "")
    .replace(/^\d+ words\.?\n+/i, "")
    .trim();
}

export function quotedWordCount(essay: string): number {
  return quotedSpans(bodyText(essay)).reduce(
    (total, span) => total + normalizeWords(span).length,
    0,
  );
}

export function quoteShare(essay: string): number {
  const words = normalizeWords(bodyText(essay)).length;
  if (words === 0) return 0;
  return quotedWordCount(essay) / words;
}

export function quoteProblems(essay: string): string[] {
  const share = quoteShare(essay);
  if (share <= QUOTE_BUDGET) return [];
  return [
    `quoted words are ${Math.round(share * 100)}% of the body; keep under ${
      Math.round(QUOTE_BUDGET * 100)
    }%`,
  ];
}

export function processProblems(essay: string): string[] {
  const problems: string[] = [];
  for (const sentence of sentencesOf(essay)) {
    if (
      /\bthe notes\b/i.test(sentence) ||
      /\bthe sources\b/i.test(sentence) ||
      /\bthis essay\b/i.test(sentence)
    ) {
      problems.push(`process sentence in the body: ${sentence.slice(0, 80)}`);
    }
  }
  return [...new Set(problems)];
}

export function groundingProblems(
  essay: string,
  notes: readonly SourceNote[],
  articles: readonly Article[] = [],
  brief = "",
): string[] {
  return [
    ...citationProblems(essay, notes, brief),
    ...copyProblems(essay, articles),
    ...quoteProblems(essay),
    ...processProblems(essay),
  ];
}

export const LAYER1_IDS = [
  "cite",
  "ids",
  "copy",
  "quotes",
  "length",
  "sources",
  "body",
] as const;

export type Layer1Id = (typeof LAYER1_IDS)[number];

export type Layer1Score = Record<Layer1Id, boolean>;

function sourcesListed(essay: string): string[] {
  const block = essay.match(/\n## Sources\s*\n([\s\S]*)$/)?.[1] ?? "";
  const ids = block.match(/\[n\d+\]/g) ?? [];
  return [...new Set(ids.map((id) => id.slice(1, -1)))];
}

export function sourcesProblems(
  essay: string,
  _notes: readonly SourceNote[],
): string[] {
  const cited = citedNoteIds(essay);
  const listed = sourcesListed(essay);
  if (cited.length === listed.length && cited.every((id) => listed.includes(id))) {
    return [];
  }
  return ["Sources list does not match cited notes"];
}

export function bodyLinkProblems(essay: string): string[] {
  const body = essay
    .replace(/\n## Sources\s*\n[\s\S]*$/, "")
    .replace(/^\uFEFF?\s*# [^\n]*\n*/, "")
    .replace(/^\d+ words\.?\n+/i, "");
  const problems: string[] = [];
  if (/https?:\/\/|www\./i.test(body)) {
    problems.push("source URL in the body");
  }
  if (/\[[^\]]+\]\([^)]+\)/.test(body)) {
    problems.push("markdown link in the body");
  }
  for (const sentence of sentencesOf(body)) {
    if (isCallToAction(sentence)) {
      problems.push(`call to action in the body: ${sentence.slice(0, 80)}`);
    }
  }
  return [...new Set([...problems, ...processProblems(body)])];
}

export function layer1Score(
  essay: string,
  notes: readonly SourceNote[],
  articles: readonly Article[],
  target: number,
  brief = "",
): Layer1Score {
  const citations = citationProblems(essay, notes, brief);
  const words = bodyWordCount(essay);
  return {
    cite: citations.every((item) => item.startsWith("citation [")),
    ids: citations.every((item) => !item.startsWith("citation [")),
    copy: copyProblems(essay, articles).length === 0,
    quotes: quoteProblems(essay).length === 0,
    length: words >= essayLengthFloor(target) &&
      words <= essayLengthCeiling(target),
    sources: sourcesProblems(essay, notes).length === 0,
    body: bodyLinkProblems(essay).length === 0,
  };
}

export function layer1Problems(
  essay: string,
  notes: readonly SourceNote[],
  articles: readonly Article[],
  target: number,
  brief = "",
): string[] {
  const score = layer1Score(essay, notes, articles, target, brief);
  const labels: Record<Layer1Id, string> = {
    cite: "uncited figure, quote, or attributed claim",
    ids: "citation does not match a note",
    copy: "unquoted 8-word copy from a source",
    quotes: "quoted words over 15% of the body",
    length: "body length outside 85–115% of the target",
    sources: "Sources list does not match cited notes",
    body: "URL, markdown link, call to action, or process sentence in the body",
  };
  return LAYER1_IDS.filter((id) => !score[id]).map((id) => labels[id]);
}
