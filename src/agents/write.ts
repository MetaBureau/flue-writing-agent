import {
  type CompletionTarget,
  CutOffReply,
  type RunMeter,
  streamChat,
} from "../complete.ts";

export type SourceNotes = { readonly text: string; readonly topic?: string };
export type EditorialStyle =
  | "economist"
  | "strunk-white"
  | "monocle"
  | "professional";
export type DraftVoice = "conversational" | "professional" | "analytical";

export const VOICE_FOR_STYLE: Record<EditorialStyle, DraftVoice> = {
  economist: "analytical",
  "strunk-white": "analytical",
  monocle: "conversational",
  professional: "professional",
};

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
  style: DraftVoice;
  content: string;
}

export const DEFAULT_WORD_COUNT = 900;
export const MAX_EXTENSIONS = 6;
export const MAX_EXTEND_CALLS = 6;
export const MAX_CONSECUTIVE_REJECTS = 3;
export const EXTENSION_ASK_RATIO = 1.5;
export const OUTLINE_MAX_TOKENS = 4096;
export const DRAFT_MAX_TOKENS = 4096;

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

export function factualNotes(notes: string): string[] {
  return noteParagraphs(notes).filter((paragraph) =>
    countWords(paragraph) >= 15
  );
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

export function repeatsDraft(draft: string, extra: string): boolean {
  const known = new Set(contentWords(draft));
  const extraWords = contentWords(extra);
  if (extraWords.length < 8) return false;
  return extraWords.filter((word) => !known.has(word)).length < 4;
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
  const added = countWords(extra);
  const ceiling = Math.max(asked + 80, 120);
  if (added < 20 || added > ceiling || !endsAsSentence(extra)) return false;
  if (draft && repeatsDraft(draft, extra)) return false;
  return groundedInNote(note, extra);
}

const FALLBACK_OUTLINE = (topic: string): Outline => ({
  title: topic.split(" ").slice(0, 4).join(" "),
  sections: [
    topic.split(/[.\n]/).map((line) => line.trim()).find(Boolean) ?? "Notes",
  ],
  wordCountTarget: wordCountFromTopic(topic),
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

export const OUTLINE_SYSTEM =
  "Return a JSON outline. Every section must name material already in the notes. Do not invent sections.";

export function outlineUserPrompt(
  notes: string,
  words = wordCountFromTopic(notes),
): string {
  return [
    `Notes:\n${notes}`,
    `Outline a ${words}-word post that uses only these notes.`,
    "Return JSON: {title: string, sections: string[], wordCountTarget: number}",
    "Each section is a heading for claims already written in the notes.",
    "Do not split one claim into several headings. Four sections at most.",
    "Do not add introduction, conclusion, future work, recommendations, or roadmap unless the notes already contain that material.",
    "Do not use a company self-description heading such as Who are we.",
  ].join("\n\n");
}

export const DRAFT_SYSTEM =
  "Write only facts that appear in the source notes. Do not add motives, rankings, roadmaps, praise, or a closing the notes do not contain.";

export function draftUserPrompt(
  instruction: string,
  outline: Pick<Outline, "title" | "sections" | "wordCountTarget">,
  notes: string,
): string {
  const sections = outline.sections.map((section) => `- ${section}`).join("\n");
  return [
    `${instruction}.`,
    `Title: ${outline.title}`,
    `Sections, in this order:\n${sections}`,
    `Source notes, the only facts you may use:\n${notes}`,
    "Cover the product facts in the notes. Say each fact once. Stop when those facts are covered.",
    "Do not copy mission statements, passion, or first-person company voice.",
    "Do not add a closing paragraph. Do not add praise, predictions, or facts that are not in the notes.",
  ].join("\n\n");
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
    "Do not add a new section. Do not add facts that are not in the notes. Do not repeat a paragraph already in the draft.",
    "Match the voice of the draft so far. Return only the new paragraphs.",
    `Source notes:\n${notes}`,
    `Draft so far:\n${draft}`,
  ].join("\n\n");
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
    `Draft so far:\n${draft}`,
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
): Promise<Outline> => {
  const topic = notes.topic ?? notes.text;
  const words = wordCountFromTopic(topic);
  if (!model.apiKey) {
    console.warn(`${model.name} key not set, using heuristic outline`);
    return FALLBACK_OUTLINE(topic);
  }

  const content = (await streamChat(model, [
    { role: "system", content: OUTLINE_SYSTEM },
    { role: "user", content: outlineUserPrompt(notes.text, words) },
  ], {
    temperature: 0.2,
    label: "outline",
    maxTokens: OUTLINE_MAX_TOKENS,
    meter,
  })).content;

  const outline = parseOutline(content, topic);
  outline.wordCountTarget = words;
  return outline;
};

export const generateDrafts = async (
  _ctx: unknown,
  outline: Outline,
  model: ModelConfig,
  notes: SourceNotes,
  meter?: RunMeter,
): Promise<Draft[]> => {
  if (!model.apiKey) {
    console.warn(`${model.name} key not set, using stub drafts`);
    return [
      { style: "conversational", content: `Draft 1 for ${outline.title}` },
      { style: "professional", content: `Draft 2 for ${outline.title}` },
      { style: "analytical", content: `Draft 3 for ${outline.title}` },
    ];
  }

  const styles: Array<{ name: DraftVoice; instruction: string }> = [
    {
      name: "conversational",
      instruction: "Write in a friendly, conversational tone",
    },
    {
      name: "professional",
      instruction: "Write in a professional, business-appropriate tone",
    },
    {
      name: "analytical",
      instruction: "Write in an analytical, data-focused tone",
    },
  ];

  const drafts: Draft[] = [];
  for (const { name, instruction } of styles) {
    const content = (await streamChat(model, [
      { role: "system", content: DRAFT_SYSTEM },
      {
        role: "user",
        content: draftUserPrompt(instruction, outline, notes.text),
      },
    ], {
      temperature: 0.3,
      label: `draft:${name}`,
      maxTokens: DRAFT_MAX_TOKENS,
      meter,
    })).content;
    drafts.push({
      style: name,
      content: content || "Draft content placeholder",
    });
  }

  return drafts;
};

export function pickDraft(drafts: Draft[], style: EditorialStyle): Draft {
  const voice = VOICE_FOR_STYLE[style];
  return drafts.find((draft) => draft.style === voice) ?? drafts[0];
}

export async function extendDraft(
  draft: string,
  notes: string,
  target: number,
  model: ModelConfig,
  label: string,
  meter?: RunMeter,
): Promise<string> {
  let text = draft.trim();
  let words = countWords(text);
  if (!model.apiKey || words >= target) return text;

  const paragraphs = factualNotes(notes);
  if (paragraphs.length === 0) return text;
  let round = 0;
  let calls = 0;
  let consecutiveRejects = 0;
  while (
    words < target && round < 3 && !extendShouldStop(calls, consecutiveRejects)
  ) {
    round += 1;
    const remaining = paragraphs.length;
    const each = Math.max(40, Math.ceil((target - words) / remaining));
    for (let index = 0; index < paragraphs.length && words < target; index++) {
      if (extendShouldStop(calls, consecutiveRejects)) break;
      calls += 1;
      const note = paragraphs[index];
      let extra = "";
      try {
        extra = (await streamChat(model, [
          { role: "system", content: DRAFT_SYSTEM },
          { role: "user", content: expansionUserPrompt(note, each, text) },
        ], {
          temperature: 0.7,
          label: `${label}:expand:${round}:${index + 1}`,
          maxTokens: expansionTokenBudget(each),
          meter,
        })).content;
      } catch (error) {
        if (!(error instanceof CutOffReply)) throw error;
        consecutiveRejects += 1;
        console.log(
          `[${label}:expand:${round}:${index + 1}] discarded cut-off reply`,
        );
        continue;
      }
      const fitted = fitExtension(extra, each);
      if (!acceptExpansion(note, fitted, each, text)) {
        consecutiveRejects += 1;
        console.log(
          `[${label}:expand:${round}:${index + 1}] rejected raw=${
            countWords(extra)
          } fitted=${countWords(fitted)}`,
        );
        continue;
      }
      consecutiveRejects = 0;
      const merged = mergeExtension(text, fitted);
      const next = countWords(merged);
      if (next <= words) continue;
      text = merged;
      words = next;
      console.log(
        `[${label}:expand:${round}:${
          index + 1
        }] ${words} words, target ${target}`,
      );
    }
  }
  return text;
}
