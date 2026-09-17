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
  const pattern = /"([^"]+)"|\u201c([^\u201d]+)\u201d|'([^']+)'/g;
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

export function figureNeedsCite(
  figure: string,
  notes: readonly SourceNote[],
): boolean {
  if (/^(?:19|20)\d{2}$/.test(figure)) {
    return notesBlob(notes).includes(figure);
  }
  return true;
}

export function citationProblems(
  essay: string,
  notes: readonly SourceNote[],
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
      if (!hasCitation(sentence) && figureNeedsCite(figure, notes)) {
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
  return text.replace(/"([^"]*)"|\u201c([^\u201d]*)\u201d|'([^']*)'/g, " ");
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

export function groundingProblems(
  essay: string,
  notes: readonly SourceNote[],
  articles: readonly Article[] = [],
): string[] {
  return [
    ...citationProblems(essay, notes),
    ...copyProblems(essay, articles),
    ...quoteProblems(essay),
  ];
}
