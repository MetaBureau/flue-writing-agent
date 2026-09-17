import {
  type ChatMessage,
  type CompletionTarget,
  CutOffReply,
  type RunMeter,
  streamChat,
} from "../complete.ts";
import { DEFAULT_ESSAY_LENGTH, essayLengthFloor, modelSlug } from "../contract.ts";

export type SourceNotes = { readonly text: string; readonly topic?: string };
export type EditorialStyle =
  | "economist"
  | "strunk-white"
  | "monocle"
  | "professional";

export interface Outline {
  title: string;
  sections: string[];
  wordCountTarget: number;
}

export interface ModelConfig extends CompletionTarget {
  provider: string;
  speed?: string;
  bestFor?: string[];
}

export interface Draft {
  model: string;
  content: string;
}

export interface Synthesis {
  model: string;
  content: string;
  fallback: boolean;
  source: "mercury" | "writer" | "longest-draft";
}

export const DEFAULT_WORD_COUNT = DEFAULT_ESSAY_LENGTH;
export const MAX_EXTENSIONS = 6;
export const MAX_EXTEND_CALLS = 6;
export const MAX_CONSECUTIVE_REJECTS = 3;
export const EXTENSION_ASK_RATIO = 1.5;
export const OUTLINE_MAX_TOKENS = 4096;
export const DRAFT_MAX_TOKENS = 4096;
export const SYNTHESIS_MAX_TOKENS = 65536;
export const REPEAT_RATIO = 0.6;

export function completionTokensForLength(words: number): number {
  return Math.min(8192, Math.max(DRAFT_MAX_TOKENS, Math.ceil(words * 2.5)));
}

export function synthesisTokens(words: number, mercury: boolean): number {
  return mercury
    ? SYNTHESIS_MAX_TOKENS
    : completionTokensForLength(words);
}

const WORD_COUNT_LINE = /^\d+ words\.?\n+/;

export function splitEssaySources(markdown: string): {
  prose: string;
  sources: string;
} {
  const stripped = stripLeadingTitle(markdown);
  const match = stripped.match(/\n## Sources\s*\n/);
  if (match?.index === undefined) {
    return { prose: stripped.replace(WORD_COUNT_LINE, "").trim(), sources: "" };
  }
  return {
    prose: stripped.slice(0, match.index).replace(WORD_COUNT_LINE, "").trim(),
    sources: stripped.slice(match.index).trim(),
  };
}

export function bodyWordCount(markdown: string): number {
  const { prose } = splitEssaySources(markdown);
  return countWords(prose.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
}

export function assertEssayLength(text: string, target: number): void {
  const words = bodyWordCount(text);
  const floor = essayLengthFloor(target);
  if (words < floor) {
    throw new Error(
      `Essay is ${words} words; ${target} were requested (minimum ${floor}).`,
    );
  }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wordCountFromTopic(topic: string): number {
  const requested = topic.match(/(\d+)\s*words/i);
  return requested ? Number(requested[1]) : DEFAULT_WORD_COUNT;
}

export function wordsToAsk(current: number, target: number): number {
  const shortBy = target - current;
  if (shortBy <= 0) return 0;
  return Math.ceil(shortBy * EXTENSION_ASK_RATIO);
}

export function noteParagraphs(notes: string): string[] {
  const parts = notes.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [notes.trim()];
}

const STOP_WORDS = new Set(
  "the a an and or of to in on for with from that this these those was were been being have has had not but its their they them you your only into via by as at than then also when while"
    .split(" "),
);

export function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) =>
    word.length > 3 && !STOP_WORDS.has(word)
  ) ?? [];
}

export function stripSourceLines(paragraph: string): string {
  return paragraph
    .split("\n")
    .filter((line) => !/^(?:Source|URL):/i.test(line.trim()))
    .join("\n")
    .trim();
}

export function describesSourcePage(paragraph: string): boolean {
  return /students can use/i.test(paragraph) ||
    /contains \d+ words/i.test(paragraph) ||
    /contains (?:one|two|three|four|five|six|seven|eight|nine|\d+) hundred words/i
      .test(paragraph) ||
    /admissions essays?/i.test(paragraph) ||
    /how to write/i.test(paragraph) ||
    /essay writing/i.test(paragraph) ||
    /writing an? essay/i.test(paragraph) ||
    /tips for writing/i.test(paragraph);
}

export function draftingNotes(notes: string): string {
  return noteParagraphs(notes)
    .filter((paragraph) => !describesSourcePage(paragraph))
    .join("\n\n");
}

export function factualNotes(notes: string): string[] {
  return noteParagraphs(notes)
    .map(stripSourceLines)
    .filter((paragraph) =>
      countWords(paragraph) >= 15 && !describesSourcePage(paragraph)
    );
}

function sentencesOf(paragraph: string): string[] {
  return paragraph.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(
    Boolean,
  );
}

export function writerFacts(notes: string): string {
  const facts = factualNotes(notes);
  if (facts.length === 0) return draftingNotes(notes);
  const buckets = facts.map(sentencesOf);
  const mixed: string[] = [];
  const longest = Math.max(...buckets.map((bucket) => bucket.length));
  for (let index = 0; index < longest; index++) {
    for (const bucket of buckets) {
      const sentence = bucket[index];
      if (sentence) mixed.push(sentence);
    }
  }
  return mixed.join(" ");
}

export function exclusiveNoteParagraphs(text: string, notes: string): number {
  const paragraphs = noteParagraphs(text).filter((paragraph) =>
    countWords(paragraph) >= 15 && !paragraph.startsWith("#")
  );
  const facts = factualNotes(notes);
  if (facts.length < 3) return 0;
  let exclusive = 0;
  for (const paragraph of paragraphs) {
    const matched = facts.filter((fact) =>
      sharedWordRatio(paragraph, fact) >= 0.3
    );
    if (matched.length === 1) exclusive += 1;
  }
  return exclusive;
}

export function isSourceCollage(text: string, notes: string): boolean {
  const paragraphs = noteParagraphs(text).filter((paragraph) =>
    countWords(paragraph) >= 15 && !paragraph.startsWith("#")
  );
  if (paragraphs.length < 3) return false;
  return exclusiveNoteParagraphs(text, notes) >= 2;
}

export function isProseExpansion(text: string): boolean {
  const trimmed = text.trim();
  if (!/^(?:["“'])?[A-Z0-9]/.test(trimmed)) return false;
  if (/\blet's count\b/i.test(trimmed) || /\bwait,/i.test(trimmed)) {
    return false;
  }
  return !trimmed.split("\n").some((line) =>
    /^\s*(?:\d+[.)]|[-*•])\s+\S/.test(line)
  );
}

export function stripLeadingTitle(text: string): string {
  return text.replace(/^\uFEFF?\s*# [^\n]*\n*/, "").trim();
}

export function publishedTitle(
  topic: string,
  outlineTitle: string,
  body: string,
): string {
  const titled = outlineTitle.trim();
  if (titled && titled.toLowerCase() !== topic.trim().toLowerCase()) {
    return titled;
  }
  const first = stripLeadingTitle(body).split(/(?<=[.!?])\s+/)[0] ?? "";
  const words = first.replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean).slice(
    0,
    8,
  );
  return words.length >= 4 ? words.join(" ") : titled || topic.trim();
}

export function essayMarkdown(title: string, body: string): string {
  const { prose, sources } = splitEssaySources(body);
  const words = bodyWordCount(prose);
  const sourceBlock = sources ? `\n\n${sources}\n` : "\n";
  return `# ${title.trim()}\n\n${words} words\n\n${prose}${sourceBlock}`;
}

export function finishEssay(
  title: string,
  text: string,
  floorWords = 0,
): string {
  const titled = title.trim().toLowerCase();
  const kept: string[] = [];
  for (const paragraph of noteParagraphs(stripLeadingTitle(text))) {
    const sentences = paragraph.replace(/\s+/g, " ").trim().split(
      /(?<=[.!?])\s+/,
    ).filter((sentence) => {
      if (!sentence) return false;
      if (sentence.replace(/[.!?]+$/, "").trim().toLowerCase() === titled) {
        return false;
      }
      if (/\b(?:and|or|of|the)\s*[.!?]\s*$/i.test(sentence)) return false;
      if (
        /^[A-Z][^.]{0,60}\b(?:describes|refers to|is defined as)\b/i.test(
          sentence,
        )
      ) return false;
      if (/^(?:these|this) include\b/i.test(sentence)) return false;
      if (
        /\b(?:working group|this paper|this study|this article|this framework|points out)\b/i
          .test(sentence)
      ) return false;
      return true;
    });
    const next = sentences.join(" ").trim();
    if (!next) continue;
    if (kept.some((prior) => sharedWordRatio(prior, next) >= REPEAT_RATIO)) {
      continue;
    }
    kept.push(next);
  }
  const cleaned = kept.join("\n\n");
  const original = stripLeadingTitle(text);
  if (
    floorWords > 0 && countWords(cleaned) < floorWords &&
    countWords(original) >= floorWords
  ) {
    return original;
  }
  return cleaned;
}

export function notesRecord(input: {
  notes: string;
  outlineModel: string;
  draftModels: readonly string[];
  synthesisModel: string;
  cost: string;
  factcheck?: string;
}): string {
  const model =
    `outline ${input.outlineModel}; drafts ${input.draftModels.join(", ")}; synthesis ${input.synthesisModel}`;
  const findings = input.factcheck?.trim()
    ? `\n\n${input.factcheck.trim()}\n`
    : "\n";
  return `Model: ${model}\nCost: ${input.cost}${findings}\n${input.notes.trim()}\n`;
}

export function groundedInNote(note: string, extra: string): boolean {
  const noteWords = new Set(contentWords(note));
  const extraWords = contentWords(extra);
  if (noteWords.size < 3 || extraWords.length === 0) return false;
  return extraWords.filter((word) => noteWords.has(word)).length >= 3;
}

export function endsAsSentence(text: string): boolean {
  return /[.!?]["']?\s*$/.test(text.trim());
}

export function fitExtension(extra: string, asked: number): string {
  const ceiling = Math.max(asked + 80, 120);
  const end = Math.max(
    extra.lastIndexOf("."),
    extra.lastIndexOf("!"),
    extra.lastIndexOf("?"),
  );
  if (end === -1) return "";
  const finished = extra.slice(0, end + 1).trim();
  if (countWords(finished) <= ceiling) return finished;
  const sentences = finished.match(/[^.!?]+[.!?]+/g) ?? [];
  let kept = "";
  for (const sentence of sentences) {
    const next = `${kept} ${sentence}`.trim();
    if (kept && countWords(next) > ceiling) break;
    kept = next;
  }
  return countWords(kept) <= ceiling ? kept : "";
}

export function expansionTokenBudget(_asked: number): number {
  return 4096;
}

export function sharedWordRatio(extra: string, paragraph: string): number {
  const words = contentWords(extra);
  if (words.length === 0) return 0;
  const known = new Set(contentWords(paragraph));
  return words.filter((word) => known.has(word)).length / words.length;
}

export function repeatsDraft(draft: string, extra: string): boolean {
  const pieces = noteParagraphs(extra).filter((piece) =>
    contentWords(piece).length >= 8
  );
  if (pieces.length === 0) return false;
  return pieces.some((piece) =>
    noteParagraphs(draft).some((paragraph) =>
      sharedWordRatio(piece, paragraph) >= REPEAT_RATIO
    )
  );
}

export function extendShouldStop(
  calls: number,
  consecutiveRejects: number,
): boolean {
  return consecutiveRejects >= MAX_CONSECUTIVE_REJECTS ||
    calls >= MAX_EXTEND_CALLS;
}

export function acceptExpansion(
  note: string,
  extra: string,
  asked: number,
  draft = "",
): boolean {
  if (!isProseExpansion(extra)) return false;
  const added = countWords(extra);
  const ceiling = Math.max(asked + 80, 120);
  if (added < 20 || added > ceiling || !endsAsSentence(extra)) return false;
  if (draft && repeatsDraft(draft, extra)) return false;
  return groundedInNote(note, extra);
}

export function extendShouldContinue(
  words: number,
  target: number,
  notesLeft: number,
  calls: number,
  consecutiveRejects: number,
): boolean {
  if (notesLeft <= 0 || words >= target) return false;
  return !extendShouldStop(calls, consecutiveRejects);
}

const FALLBACK_OUTLINE = (
  topic: string,
  words = wordCountFromTopic(topic),
): Outline => ({
  title: topic.split(" ").slice(0, 4).join(" "),
  sections: [
    topic.split(/[.\n]/).map((line) => line.trim()).find(Boolean) ?? "Notes",
  ],
  wordCountTarget: words,
});

function isOutline(value: unknown): value is Outline {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("title" in value) || !("sections" in value) ||
    !("wordCountTarget" in value)
  ) return false;
  const { title, sections, wordCountTarget } = value;
  return typeof title === "string" &&
    Array.isArray(sections) &&
    sections.every((section) => typeof section === "string") &&
    typeof wordCountTarget === "number";
}

function parseOutline(content: string, topic: string): Outline {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return FALLBACK_OUTLINE(topic);
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return isOutline(parsed) ? parsed : FALLBACK_OUTLINE(topic);
  } catch {
    return FALLBACK_OUTLINE(topic);
  }
}

export const NOTES_GROUNDING =
  "Notes are the source for specific facts, figures, quotes, and named studies. You may add argument, interpretation, examples, transitions, and widely known general knowledge. Do not invent statistics, studies, quotes, or sources. Do not present a weak source such as a forum post or a TIL as research.";

export function notesPrefix(notes: string): string {
  return `Research notes:\n${notes}`;
}

export function stageSystem(notes: string, instruction: string): string {
  return `${notesPrefix(notes)}\n\n${instruction}`;
}

export function systemMessage(notes: string, instruction: string): ChatMessage {
  return {
    role: "system",
    content: stageSystem(notes, instruction),
    cachedPrefix: notesPrefix(notes),
  };
}

export const OUTLINE_SYSTEM =
  "Return a JSON outline for one essay. Draw specific facts from the notes. Do not invent a statistic, a study, a quote, or a source.";

export const OUTLINE_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "outline",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "sections", "wordCountTarget"],
      properties: {
        title: { type: "string" },
        sections: { type: "array", items: { type: "string" } },
        wordCountTarget: { type: "number" },
      },
    },
  },
};

export function outlineUserPrompt(
  topic: string,
  words = wordCountFromTopic(topic),
): string {
  return [
    `The essay is about: ${topic}.`,
    `Outline a ${words}-word essay. Draw specific facts, figures, quotes, and named studies from the notes.`,
    "Return JSON: {title: string, sections: string[], wordCountTarget: number}",
    "The opening states one claim about that topic. Every section advances that claim. Four sections at most.",
    "The opening and the close may frame the claim with argument and widely known general knowledge. Do not invent a statistic, a study, a quote, or a source.",
    "The notes are one set of facts, not a list of sections. Do not make a section for each source.",
    "Do not use a company self-description heading such as Who are we.",
  ].join("\n\n");
}

export const DRAFT_SYSTEM = `Write one essay. ${NOTES_GROUNDING}`;

export function draftUserPrompt(
  outline: Pick<Outline, "title" | "sections" | "wordCountTarget">,
  topic = "",
): string {
  const sections = outline.sections.map((section) => `- ${section}`).join("\n");
  return [
    topic ? `The essay is about: ${topic}.` : "Write the essay.",
    `Title: ${outline.title}`,
    `Sections, in this order:\n${sections}`,
    "The notes are one set of facts, not a list of sections. The opening states one claim about that topic. Every paragraph advances that claim. Do not give each source its own paragraph.",
    `Write about ${outline.wordCountTarget} words. ${NOTES_GROUNDING} Close on a fact you already used.`,
    "Do not paste source titles, URLs, or markdown links. Citations are added later.",
    "Say each specific fact once. Write each fact in full sentences. Leave out notes that are not about the subject.",
  ].join("\n\n");
}

export const SYNTHESIS_SYSTEM =
  `Write one essay from the drafts. ${NOTES_GROUNDING} Take the strongest claim, structure, paragraphs, and phrasing from each draft. Keep the best-supported specifics. Remove repetition. Return only the essay.`;

export function synthesisUserPrompt(
  topic: string,
  outline: Outline,
  drafts: readonly Draft[],
): string {
  const sections = outline.sections.map((section) => `- ${section}`).join("\n");
  const labelled = drafts.map((draft, index) => {
    const letter = String.fromCharCode(65 + index);
    return `Draft ${letter}:\n${draft.content.trim()}`;
  }).join("\n\n");
  return [
    `The essay is about: ${topic}.`,
    `Title: ${outline.title}`,
    `Sections, in this order:\n${sections}`,
    `Write about ${outline.wordCountTarget} words.`,
    "Take the strongest claim, structure, paragraphs, and phrasing from each draft. Keep the best-supported specifics. Remove repetition. Hit the word count. Return only the essay.",
    labelled,
  ].join("\n\n");
}

export function acceptedDrafts(
  results: PromiseSettledResult<Draft>[],
): Draft[] {
  const drafts = results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    if (!result.value.content.trim()) return [];
    return [result.value];
  });
  if (drafts.length === 0) throw new Error("No drafts succeeded");
  return drafts;
}

export function longestDraft(drafts: readonly Draft[]): Draft {
  if (drafts.length === 0) throw new Error("No drafts");
  let longest = drafts[0];
  let words = countWords(longest.content);
  for (const draft of drafts.slice(1)) {
    const next = countWords(draft.content);
    if (next > words) {
      longest = draft;
      words = next;
    }
  }
  return longest;
}

export function pickSynthesizedText(
  reply: string,
  drafts: readonly Draft[],
): { content: string; fallback: boolean } {
  const content = reply.trim();
  if (content) return { content, fallback: false };
  return { content: longestDraft(drafts).content, fallback: true };
}

export function extensionUserPrompt(
  draft: string,
  notes: string,
  target: number,
  current: number,
): string {
  const ask = wordsToAsk(current, target);
  return [
    `The draft is ${current} words. Write ${ask} more words so the piece reaches at least ${target}.`,
    "Expand facts already in the draft and in the source notes. Write the thin sections out in full sentences.",
    "Do not add a new section. You may add argument and general knowledge. Do not invent statistics, studies, quotes, or sources. Do not repeat a paragraph already in the draft.",
    "Match the voice of the draft so far. Return only the new paragraphs.",
    `Source notes:\n${notes}`,
    `Draft so far:\n${draft}`,
  ].join("\n\n");
}

export function weaveUserPrompt(
  topic: string,
  draft: string,
  target: number,
): string {
  return [
    `The essay is about: ${topic}.`,
    `Return the full essay of about ${target} words. It is ${
      countWords(draft)
    } words. Keep every fact already in the draft. Weave unused notes until the essay reaches ${target} words.`,
    "The notes are one set of facts, not a list of sections. Keep the opening claim. Weave unused facts into the paragraphs they belong to.",
    "Do not add a paragraph for each source. Do not repeat a point. You may add argument and general knowledge. Do not invent statistics, studies, quotes, or sources.",
    "Do not paste source titles, URLs, or markdown links. End with a complete sentence. Return only the essay.",
  ].join("\n\n");
}

export function isAppendedDump(draft: string, next: string): boolean {
  const base = draft.replace(/\s+/g, " ").trim();
  const woven = next.replace(/\s+/g, " ").trim();
  if (base.length < 40 || woven.length <= base.length) return false;
  return woven.startsWith(base);
}

export function acceptWovenEssay(draft: string, next: string): boolean {
  const woven = next.trim();
  if (!isProseExpansion(woven) || !endsAsSentence(woven)) return false;
  if (isAppendedDump(draft, woven)) return false;
  const words = countWords(woven);
  const base = countWords(draft);
  if (words < Math.max(80, Math.floor(base * 0.8))) return false;
  return groundedInNote(draft, woven);
}

export function expansionUserPrompt(
  note: string,
  words: number,
  draft: string,
): string {
  const ceiling = words + 40;
  return [
    `Write about ${words} words, and no more than ${ceiling}. End with a complete sentence.`,
    "Add only facts from this note that the draft has not already said.",
    "Use active voice. Do not add praise, a mission, a prediction, or a closing.",
    "Do not name the author of a source page. Do not attribute the product to another company.",
    `Note:\n${note}`,
    ...(draft ? [`Draft so far:\n${draft}`] : []),
  ].join("\n\n");
}

export function mergeExtension(draft: string, extra: string): string {
  const addition = extra.trim();
  const base = draft.trim();
  if (!addition) return base;
  const head = base.slice(0, Math.min(80, base.length));
  if (head && addition.startsWith(head)) return addition;
  if (base.includes(addition)) return base;
  return `${base}\n\n${addition}`;
}

export async function extendToTarget(
  draft: string,
  notes: string,
  target: number,
  complete: (prompt: string, attempt: number) => Promise<string>,
): Promise<{ text: string; words: number; attempts: number }> {
  let text = draft.trim();
  let words = countWords(text);
  let attempts = 0;
  while (words < target && attempts < MAX_EXTENSIONS) {
    attempts += 1;
    const extra = await complete(
      extensionUserPrompt(text, notes, target, words),
      attempts,
    );
    const merged = mergeExtension(text, extra);
    const next = countWords(merged);
    if (next <= words) break;
    text = merged;
    words = next;
  }
  return { text, words, attempts };
}

export const generateOutline = async (
  _ctx: unknown,
  notes: SourceNotes,
  model: ModelConfig,
  meter?: RunMeter,
  supportedParams?: readonly string[],
  words?: number,
): Promise<Outline> => {
  const topic = notes.topic ?? notes.text;
  const target = words ?? wordCountFromTopic(topic);
  if (!model.apiKey) {
    console.warn(`${model.name} key not set, using heuristic outline`);
    return FALLBACK_OUTLINE(topic, target);
  }

  const content = (await streamChat(model, [
    systemMessage(writerFacts(notes.text), OUTLINE_SYSTEM),
    { role: "user", content: outlineUserPrompt(topic, target) },
  ], {
    temperature: 0.2,
    label: "outline",
    maxTokens: OUTLINE_MAX_TOKENS,
    meter,
    supportedParams,
    responseFormat: OUTLINE_RESPONSE_FORMAT,
  })).content;

  const outline = parseOutline(content, topic);
  outline.wordCountTarget = target;
  return outline;
};

export const generateDrafts = async (
  _ctx: unknown,
  outline: Outline,
  models: readonly ModelConfig[],
  notes: SourceNotes,
  meter?: RunMeter,
): Promise<Draft[]> => {
  if (models.length === 0) throw new Error("No draft models");
  const facts = writerFacts(notes.text);
  const prompt = draftUserPrompt(outline, notes.topic);
  const results = await Promise.allSettled(models.map(async (model) => {
    const id = model.modelId ?? model.name;
    if (!model.apiKey) {
      return { model: id, content: `Draft for ${outline.title}` };
    }
    const content = (await streamChat(model, [
      systemMessage(facts, DRAFT_SYSTEM),
      { role: "user", content: prompt },
    ], {
      temperature: 0.3,
      label: `draft:${modelSlug(id)}`,
      maxTokens: completionTokensForLength(outline.wordCountTarget),
      meter,
    })).content;
    if (!content.trim()) throw new Error("empty draft");
    return { model: id, content };
  }));
  for (const [index, result] of results.entries()) {
    if (result.status !== "rejected") continue;
    const id = models[index].modelId ?? models[index].name;
    const reason = result.reason instanceof Error
      ? result.reason.message
      : "draft failed";
    console.log(`[draft:${modelSlug(id)}] ${reason}`);
  }
  return acceptedDrafts(results);
};

export async function synthesizeEssay(
  outline: Outline,
  drafts: readonly Draft[],
  notes: SourceNotes,
  mercury: ModelConfig,
  writer: ModelConfig,
  meter?: RunMeter,
): Promise<Synthesis> {
  const longest = longestDraft(drafts);
  const fallback = (): Synthesis => ({
    model: longest.model,
    content: longest.content,
    fallback: true,
    source: "longest-draft",
  });
  const target = mercury.apiKey ? mercury : writer;
  const source = mercury.apiKey ? "mercury" : "writer";
  if (!target.apiKey) {
    console.warn("[synthesis] no API key; using longest draft");
    return fallback();
  }
  let reply = "";
  try {
    reply = (await streamChat(target, [
      systemMessage(writerFacts(notes.text), SYNTHESIS_SYSTEM),
      {
        role: "user",
        content: synthesisUserPrompt(notes.topic ?? notes.text, outline, drafts),
      },
    ], {
      temperature: 0.3,
      label: "synthesis",
      maxTokens: synthesisTokens(outline.wordCountTarget, source === "mercury"),
      meter,
    })).content;
  } catch (error) {
    if (!(error instanceof CutOffReply)) throw error;
    console.warn("[synthesis] cut off; using longest draft");
    return fallback();
  }
  const picked = pickSynthesizedText(reply, drafts);
  if (picked.fallback) {
    console.warn("[synthesis] empty reply; using longest draft");
    return fallback();
  }
  return {
    model: target.modelId ?? target.name,
    content: picked.content,
    fallback: false,
    source,
  };
}

export async function extendDraft(
  draft: string,
  notes: string,
  target: number,
  model: ModelConfig,
  label: string,
  meter?: RunMeter,
  topic = "",
): Promise<string> {
  let text = draft.trim();
  if (!model.apiKey || factualNotes(notes).length === 0) return text;
  let calls = 0;
  let rejects = 0;
  while (
    extendShouldContinue(
      countWords(text),
      target,
      factualNotes(notes).length,
      calls,
      rejects,
    )
  ) {
    calls += 1;
    let woven = "";
    try {
      woven = (await streamChat(model, [
        systemMessage(
          writerFacts(notes),
          `${DRAFT_SYSTEM}\n\nDraft so far:\n${text}`,
        ),
        { role: "user", content: weaveUserPrompt(topic, text, target) },
      ], {
        temperature: 0.4,
        label: `${label}:weave`,
        maxTokens: completionTokensForLength(target),
        meter,
      })).content;
    } catch (error) {
      if (!(error instanceof CutOffReply)) throw error;
      console.log(`[${label}:weave] discarded cut-off reply`);
      rejects += 1;
      continue;
    }
    const next = stripLeadingTitle(woven);
    if (!acceptWovenEssay(text, next) || countWords(next) <= countWords(text)) {
      console.log(`[${label}:weave] rejected ${countWords(next)} words`);
      rejects += 1;
      continue;
    }
    console.log(
      `[${label}:weave] ${countWords(text)} -> ${
        countWords(next)
      } words, target ${target}`,
    );
    text = next;
    rejects = 0;
  }
  return text;
}
