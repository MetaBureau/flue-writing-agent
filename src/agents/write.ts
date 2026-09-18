import type { Brief } from "../brief.ts";
import {
  type ChatMessage,
  type CompletionTarget,
  CutOffReply,
  type RunMeter,
  streamChat,
} from "../complete.ts";
import {
  DEFAULT_ESSAY_LENGTH,
  essayLengthCeiling,
  essayLengthFloor,
  lengthRange,
} from "../contract.ts";
import {
  type Article,
  canonicalUrl,
  formatArticles,
  formatAttributedNotes,
  isEncyclopaediaOrLiveBlog,
  quoteInArticle,
  relevantToQuery,
  resolvedOutlet,
  type SourceNote,
  sourceNotesFromUnknown,
} from "../notes.ts";
import { styleSystemPrompt, type StyleRules } from "../skills/styles.ts";

export type SourceNotes = {
  readonly text: string;
  readonly topic?: string;
  readonly brief?: Brief;
};

export type EditorialStyle =
  | "economist"
  | "strunk-white"
  | "monocle"
  | "professional";

export interface EssayPlan {
  title: string;
  claim: string;
  wordCountTarget: number;
  sections: PlanSection[];
  counters: string[];
  gaps: string[];
}

export interface PlanSection {
  heading: string;
  purpose: string;
  noteIds: string[];
}

export interface ModelConfig extends CompletionTarget {
  provider: string;
  speed?: string;
  bestFor?: string[];
}

export const DEFAULT_WORD_COUNT = DEFAULT_ESSAY_LENGTH;
export const NOTES_MAX_TOKENS = 8192;
export const PLAN_MAX_TOKENS = 4096;
export const DRAFT_MAX_TOKENS = 4096;

export function completionTokensForLength(words: number): number {
  return Math.min(8192, Math.max(DRAFT_MAX_TOKENS, Math.ceil(words * 3.5)));
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
  const ceiling = essayLengthCeiling(target);
  if (words < floor) {
    throw new Error(
      `Essay is ${words} words; ${target} were requested (minimum ${floor}).`,
    );
  }
  if (words > ceiling) {
    throw new Error(
      `Essay is ${words} words; ${target} were requested (maximum ${ceiling}).`,
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

export function noteParagraphs(notes: string): string[] {
  const parts = notes.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [notes.trim()];
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

const STOP_WORDS = new Set(
  "the a an and or of to in on for with from that this these those was were been being have has had not but its their they them you your only into via by as at than then also when while"
    .split(" "),
);

export function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) =>
    word.length > 3 && !STOP_WORDS.has(word)
  ) ?? [];
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

const CALL_TO_ACTION =
  /\b(?:click here|shop now|buy now|order now|visit our)\b/i;

export function isCallToAction(sentence: string): boolean {
  return CALL_TO_ACTION.test(sentence);
}

export function stripBodyLinks(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.!?])/g, "$1");
}

export function dropCallsToAction(text: string): string {
  const cleaned = stripBodyLinks(text);
  return cleaned.split(/\n\n+/).map((paragraph) =>
    paragraph.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter((
      sentence,
    ) => sentence && !isCallToAction(sentence)).join(" ").trim()
  ).filter(Boolean).join("\n\n");
}

export function cleanEssayBody(text: string): string {
  const { prose, sources } = splitEssaySources(text);
  const clean = dropCallsToAction(prose);
  return sources ? `${clean}\n\n${sources}` : clean;
}

export function essayMarkdown(title: string, body: string): string {
  const cleaned = cleanEssayBody(body);
  const { prose, sources } = splitEssaySources(cleaned);
  const words = bodyWordCount(prose);
  const sourceBlock = sources ? `\n\n${sources}\n` : "\n";
  return `# ${title.trim()}\n\n${words} words\n\n${prose}${sourceBlock}`;
}

export function essayReadyToSave(
  title: string,
  body: string,
  target: number,
): string {
  const markdown = essayMarkdown(title, body);
  assertEssayLength(markdown, target);
  return markdown;
}

export function essayForDisk(
  title: string,
  body: string,
  target: number,
  keepOnFail = false,
): { markdown: string; error?: string } {
  try {
    return { markdown: essayReadyToSave(title, body, target) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed.";
    return {
      markdown: essayMarkdown(title, body),
      error: keepOnFail ? undefined : message,
    };
  }
}

export function recoverableEssay(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (
    /^(Layer 1 blocked save:|Essay is \d+ words|No topic\.|Call research first\.|Saved |Research is below the source floor|Plan bound leftover:|The writer was cancelled|Tavily HTTP)/
      .test(trimmed)
  ) {
    return undefined;
  }
  if (bodyWordCount(trimmed) < 80) return undefined;
  return trimmed;
}

export function notesRecord(input: {
  notes: string;
  writerModel: string;
  cost: string;
  brief?: string;
  plan?: string;
  critic?: string;
}): string {
  const findings = [input.brief, input.plan, input.critic]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
  const block = findings ? `\n\n${findings}\n` : "\n";
  return `Model: ${input.writerModel}\nCost: ${input.cost}${block}\n${input.notes.trim()}\n`;
}

export const NOTES_GROUNDING =
  "Notes are the source for specific facts, figures, quotes, and named studies. Keep each note's attribution. You may add argument, interpretation, examples, transitions, and widely known general knowledge. Do not invent statistics, studies, quotes, or sources. Do not present a weak source such as a forum post or a TIL as research.";

export const BRIEF_PRECEDENCE =
  "Stage rules below are defaults. Where a rule conflicts with the brief's audience, purpose, tone, or constraints, follow the brief. Never break the grounding rule: do not invent statistics, studies, quotes, or sources.";

export const BRIEF_ASK = "Write the essay the brief asks for.";

export function topicBrief(text: string): Brief {
  return {
    text,
    subject: "",
    claim: "",
    audience: "",
    purpose: "",
    tone: "",
    constraints: [],
  };
}

export function briefFromNotes(notes: SourceNotes): Brief {
  return notes.brief ?? topicBrief(notes.topic ?? notes.text);
}

export function briefBlock(brief: Brief): string {
  const fields = [
    brief.subject ? `Subject: ${brief.subject}` : "",
    brief.claim ? `Claim: ${brief.claim}` : "",
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.purpose ? `Purpose: ${brief.purpose}` : "",
    brief.tone ? `Tone: ${brief.tone}` : "",
    brief.constraints.length > 0
      ? `Constraints: ${brief.constraints.join("; ")}`
      : "",
  ].filter(Boolean);
  return [
    "Brief (from the user; it governs every choice below):",
    brief.text,
    fields.length > 0 ? fields.join(" · ") : "",
    BRIEF_PRECEDENCE,
  ].filter(Boolean).join("\n");
}

export function notesPrefix(notes: string): string {
  return `Research notes:\n${notes}`;
}

export function cachedPrefix(brief: Brief, notes: string): string {
  return `${briefBlock(brief)}\n\n${notesPrefix(notes)}`;
}

export function stageSystem(
  notes: string,
  instruction: string,
  brief: Brief,
): string {
  return `${cachedPrefix(brief, notes)}\n\n${instruction}`;
}

export function systemMessage(
  notes: string,
  instruction: string,
  brief: Brief,
): ChatMessage {
  return {
    role: "system",
    content: stageSystem(notes, instruction, brief),
    cachedPrefix: cachedPrefix(brief, notes),
  };
}

export function jsonObject(
  content: string,
): Record<string, unknown> | undefined {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string =>
    typeof item === "string" && Boolean(item.trim())
  ).map((item) => item.trim());
}

export function sectionLimit(words: number): number {
  if (words <= 700) return 3;
  if (words <= 1500) return 4;
  if (words <= 2500) return 5;
  return 6;
}

export function cleanSectionHeading(heading: string): string {
  return heading
    .replace(/^(?:introduction|conclusion|opening|closing|close)\s*:\s*/i, "")
    .replace(/^(?:introduction|conclusion)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function supportSections(
  sections: PlanSection[],
  notes: readonly SourceNote[],
): PlanSection[] {
  const strongIds = notes
    .filter((note) => !isEncyclopaediaOrLiveBlog(note.url, note.title))
    .map((note) => note.id);
  const known = new Set(notes.map((note) => note.id));
  return sections.map((section) => {
    const noteIds = known.size === 0
      ? []
      : section.noteIds.filter((id) => known.has(id));
    if (noteIds.length === 0) return { ...section, noteIds };
    if (noteIds.some((id) => strongIds.includes(id))) {
      return { ...section, noteIds };
    }
    const extra = strongIds.find((id) => !noteIds.includes(id));
    if (!extra) return { ...section, noteIds };
    return { ...section, noteIds: [...noteIds, extra] };
  });
}

export function planFromContent(
  content: string,
  target: number,
  topic: string,
  notes: readonly SourceNote[] = [],
): EssayPlan {
  const row = jsonObject(content);
  const title = typeof row?.title === "string" && row.title.trim()
    ? row.title.trim()
    : topic.split(" ").slice(0, 6).join(" ");
  const claim = typeof row?.claim === "string" ? row.claim.trim() : "";
  const cap = sectionLimit(target);
  const sections: PlanSection[] = [];
  if (Array.isArray(row?.sections)) {
    for (const item of row.sections) {
      if (typeof item !== "object" || item === null) continue;
      const section = item as Record<string, unknown>;
      const heading = cleanSectionHeading(
        typeof section.heading === "string" ? section.heading.trim() : "",
      );
      if (!heading) continue;
      sections.push({
        heading,
        purpose: typeof section.purpose === "string" ? section.purpose.trim() : "",
        noteIds: stringList(section.noteIds).map((id) =>
          id.replace(/^\[|\]$/g, "").toLowerCase()
        ),
      });
      if (sections.length >= cap) break;
    }
  }
  return {
    title,
    claim,
    wordCountTarget: target,
    sections: supportSections(
      sections.length > 0
        ? sections
        : [{ heading: title, purpose: "Argue the claim", noteIds: [] }],
      notes,
    ),
    counters: stringList(row?.counters),
    gaps: stringList(row?.gaps),
  };
}

export function formatPlan(plan: EssayPlan): string {
  const sections = plan.sections.map((section) => {
    const notes = section.noteIds.length > 0
      ? section.noteIds.map((id) => `[${id}]`).join(", ")
      : "no notes";
    return `- ${section.heading} (${notes})${
      section.purpose ? `: ${section.purpose}` : ""
    }`;
  }).join("\n");
  const counters = plan.counters.length > 0
    ? plan.counters.map((item) => `- ${item}`).join("\n")
    : "- none named";
  const gaps = plan.gaps.length > 0
    ? plan.gaps.map((item) => `- ${item}`).join("\n")
    : "- none named";
  const claim = plan.claim ? `Claim: ${plan.claim}\n\n` : "";
  return `# ${plan.title}\n\n${claim}Sections:\n${sections}\n\nCounter-arguments:\n${counters}\n\nGaps:\n${gaps}\n`;
}

export const NOTES_SYSTEM =
  "Turn each article into structured notes. Keep attribution. The outlet is the publication that owns the URL's domain, not a brand mentioned on the page. Do not invent a quote, a date, an author, or a study. Empty strings are allowed when the article does not name them. Drop navigation, sidebars, related-story headlines, and claims that are not about this article's subject.";

export const NOTES_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "source_notes",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["notes"],
      properties: {
        notes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "url",
              "title",
              "author",
              "outlet",
              "date",
              "stance",
              "claims",
            ],
            properties: {
              id: { type: "string" },
              url: { type: "string" },
              title: { type: "string" },
              author: { type: "string" },
              outlet: { type: "string" },
              date: { type: "string" },
              stance: { type: "string" },
              claims: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["claim", "quote"],
                  properties: {
                    claim: { type: "string" },
                    quote: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export function notesUserPrompt(articles: readonly Article[]): string {
  return [
    "For each article, return a note with id n1, n2, ... in article order.",
    "Keep the URL. Name the author when the page does. Set outlet to the publication that owns this URL's domain. Keep the date. State the source's overall stance in one sentence.",
    "List at most four checkable claims. Each claim needs an exact quote from that article. Drop navigation, sidebars, and unrelated headlines.",
    "Return JSON {notes: [{id, url, title, author, outlet, date, stance, claims: [{claim, quote}]}]}",
    formatArticles(articles),
  ].join("\n\n");
}

export const PLAN_SYSTEM =
  "Plan one essay from the attributed notes. The essay argues one claim. If the brief has none, propose one the notes can support. Map each section to note ids. Name counter-arguments the notes support. Name gaps the notes do not cover. Do not invent sources to fill a gap. Do not write a neutral survey. Do not plan a section that lists gaps, discusses the notes, or talks about the research. Gaps stay in gaps. Do not label a section Introduction or Conclusion. When the brief is architecture or implementation for a technical reader, each section's purpose includes that mechanism's operational bound (overflow, conflict, aging, or failure) as one committed policy, not a menu of options.";

export const PLAN_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "essay_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "claim", "sections", "counters", "gaps"],
      properties: {
        title: { type: "string" },
        claim: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["heading", "purpose", "noteIds"],
            properties: {
              heading: { type: "string" },
              purpose: { type: "string" },
              noteIds: { type: "array", items: { type: "string" } },
            },
          },
        },
        counters: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export function planUserPrompt(brief: Brief, target: number): string {
  const claimLine = brief.claim
    ? `Argue this claim: ${brief.claim}`
    : "The brief states no claim. Propose one arguable claim the notes can support. Put it in claim. An essay with no claim is a fail, not a survey.";
  return [
    briefBlock(brief),
    BRIEF_ASK,
    `Plan a ${target}-word essay in at most ${sectionLimit(target)} sections.`,
    claimLine,
    "Each section lists the note ids it will use. Plan how to handle opposing notes. Name gaps the notes do not cover. Do not invent a source for a gap. Do not plan a section about gaps or the notes. Do not name a section Introduction or Conclusion. When the brief is architecture or implementation for a technical reader, each section's purpose includes that mechanism's operational bound (overflow, conflict, aging, or failure) as one committed policy, not a menu of options.",
    "Return JSON {title, claim, sections: [{heading, purpose, noteIds}], counters, gaps}.",
  ].join("\n\n");
}

export const DRAFT_SYSTEM =
  `Write one essay from the brief, and from the plan and attributed notes when those exist. ${NOTES_GROUNDING} Sources and quotations are optional unless you use a figure, a quotation, or a sourced claim. Paraphrase when you do use notes. Quoted words must stay under 15% of the body. Quote only a phrase that would lose force if rewritten. When notes exist, cite a note id in square brackets after every figure, quote, or attributed claim, like [n3]. Name the outlet or author the first time you use a source, then cite without repeating that name every sentence. A copied phrase from a source must be in quotation marks and cited. If there are no notes, do not invent citations, a Sources list, statistics, studies, quotes, or sources. Do not weave unused notes. Do not paste a URL or a call to action. Do not write about the notes, the sources as a set, the research, or the essay itself. State the claim in the opening. The close answers the claim; do not retreat into what the evidence cannot settle. When the brief asks for architecture or implementation, each mechanism needs its operational bound stated as one committed policy, not a menu of options and not a sibling failure mode. A timeout or fail-open policy does not cover overflow of what that mechanism returns. If the plan named a bound, write that bound. State the bound in the mechanism, not in a coda paragraph.`;

export function draftUserPrompt(
  plan: EssayPlan,
  brief: Brief,
  style?: StyleRules,
): string {
  const sections = plan.sections.map((section) => {
    const ids = section.noteIds.length > 0
      ? section.noteIds.map((id) => `[${id}]`).join(", ")
      : "argument only";
    return `- ${section.heading} (${ids})${
      section.purpose ? `: ${section.purpose}` : ""
    }`;
  }).join("\n");
  const counters = plan.counters.length > 0
    ? plan.counters.map((item) => `- ${item}`).join("\n")
    : "- none named";
  const gaps = plan.gaps.length > 0
    ? `Gaps the notes do not cover. Do not invent facts for them:\n${
      plan.gaps.map((item) => `- ${item}`).join("\n")
    }`
    : "";
  return [
    briefBlock(brief),
    BRIEF_ASK,
    style ? styleSystemPrompt(style) : "",
    `Title: ${plan.title}`,
    plan.claim ? `Claim: ${plan.claim}. State it in the opening.` : "",
    `Sections, in this order:\n${sections}`,
    `Counter-arguments to handle:\n${counters}`,
    gaps,
    `Write about ${plan.wordCountTarget} words. ${
      lengthRange(plan.wordCountTarget)
    }`,
    plan.wordCountTarget <= 700
      ? "Write continuous prose. Do not use markdown headings."
      : "Use at most one markdown heading per planned section. Do not label a heading Introduction or Conclusion.",
    "Paraphrase the notes. Keep quoted words under 15% of the body. Cite [n1] style ids after figures, quotes, and attributed claims. Name who said it the first time, not in every sentence. Return only the essay.",
  ].filter(Boolean).join("\n\n");
}

export function expandUserPrompt(
  brief: Brief,
  plan: EssayPlan,
  essay: string,
): string {
  const words = countWords(splitEssaySources(essay).prose);
  return [
    briefBlock(brief),
    BRIEF_ASK,
    `The essay is ${words} words. ${lengthRange(plan.wordCountTarget)}`,
    "Expand only the thin sections, using notes already in the plan. Do not weave unused notes. Keep citations. Return the full essay.",
    essay.trim(),
  ].join("\n\n");
}

const truncatedArticle = (article: Article): Article => ({
  ...article,
  text: article.text.slice(0, 4000),
});

export function notesFromArticles(articles: readonly Article[]): SourceNote[] {
  return articles.map((article, index) => ({
    id: `n${index + 1}`,
    url: article.url,
    title: article.title,
    author: "",
    outlet: resolvedOutlet("", article.url),
    date: article.publishedAt,
    stance: "unknown",
    claims: [{
      claim: article.text.slice(0, 400),
      quote: "",
    }],
  }));
}

function groundedClaims(
  note: SourceNote,
  article: Article | undefined,
  query: string,
): SourceNote["claims"] {
  const kept = note.claims.filter((claim) => {
    if (claim.quote && article && !quoteInArticle(claim.quote, article.text)) {
      return false;
    }
    if (!query) return true;
    return relevantToQuery(query, {
      title: claim.claim,
      url: note.url,
      content: claim.quote || claim.claim,
    });
  });
  return kept.length > 0 ? kept : note.claims.slice(0, 1);
}

export async function extractSourceNotes(
  articles: readonly Article[],
  model: ModelConfig,
  brief: Brief,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<SourceNote[]> {
  if (articles.length === 0 || !model.apiKey) return [];
  const clipped = articles.map(truncatedArticle);
  try {
    const content = (await streamChat(model, [
      systemMessage(
        "Articles follow in the user message. Keep attribution.",
        NOTES_SYSTEM,
        brief,
      ),
      { role: "user", content: notesUserPrompt(clipped) },
    ], {
      temperature: 0,
      label: "notes",
      maxTokens: NOTES_MAX_TOKENS,
      meter,
      supportedParams,
      responseFormat: NOTES_RESPONSE_FORMAT,
    })).content;
    const parsed = sourceNotesFromUnknown(jsonObject(content) ?? content);
    if (parsed.length === 0) return notesFromArticles(clipped);
    const query = [brief.subject, brief.claim].filter(Boolean).join(" ");
    return parsed.map((note, index) => {
      const url = note.url || clipped[index]?.url || note.url;
      const article = clipped.find((item) =>
        canonicalUrl(item.url) === canonicalUrl(url)
      ) ?? clipped[index];
      return {
        ...note,
        url,
        outlet: resolvedOutlet(note.outlet, url),
        date: note.date || article?.publishedAt || "",
        claims: groundedClaims(note, article, query),
      };
    });
  } catch (error) {
    if (error instanceof CutOffReply) return notesFromArticles(clipped);
    throw error;
  }
}

export async function planEssay(
  brief: Brief,
  notes: readonly SourceNote[],
  target: number,
  model: ModelConfig,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<EssayPlan> {
  const topic = brief.subject || brief.text;
  if (!model.apiKey) {
    return planFromContent("", target, topic, notes);
  }
  try {
    const content = (await streamChat(model, [
      systemMessage(formatAttributedNotes(notes), PLAN_SYSTEM, brief),
      { role: "user", content: planUserPrompt(brief, target) },
    ], {
      temperature: 0.2,
      label: "plan",
      maxTokens: PLAN_MAX_TOKENS,
      meter,
      supportedParams,
      responseFormat: PLAN_RESPONSE_FORMAT,
    })).content;
    return planFromContent(content, target, topic, notes);
  } catch (error) {
    if (error instanceof CutOffReply) {
      return planFromContent("", target, topic, notes);
    }
    throw error;
  }
}

export async function draftEssay(
  brief: Brief,
  notes: readonly SourceNote[],
  plan: EssayPlan,
  model: ModelConfig,
  style?: StyleRules,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<string> {
  if (!model.apiKey) {
    throw new Error(`${model.name} API key is not set`);
  }
  const content = (await streamChat(model, [
    systemMessage(formatAttributedNotes(notes), DRAFT_SYSTEM, brief),
    { role: "user", content: draftUserPrompt(plan, brief, style) },
  ], {
    temperature: 0.4,
    label: "draft",
    maxTokens: completionTokensForLength(plan.wordCountTarget),
    meter,
    supportedParams,
  })).content;
  return stripLeadingTitle(content);
}

export function shortenUserPrompt(
  brief: Brief,
  plan: EssayPlan,
  essay: string,
): string {
  const words = countWords(splitEssaySources(essay).prose);
  return [
    briefBlock(brief),
    BRIEF_ASK,
    `The essay is ${words} words. ${lengthRange(plan.wordCountTarget)}`,
    "Cut only filler. Keep citations, quotes, and the close. Do not drop attributed claims. Return the full essay.",
    essay.trim(),
  ].join("\n\n");
}

export async function expandIfShort(
  essay: string,
  brief: Brief,
  notes: readonly SourceNote[],
  plan: EssayPlan,
  model: ModelConfig,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<string> {
  const words = bodyWordCount(essay);
  if (words >= essayLengthFloor(plan.wordCountTarget) || !model.apiKey) {
    return essay;
  }
  try {
    const content = (await streamChat(model, [
      systemMessage(formatAttributedNotes(notes), DRAFT_SYSTEM, brief),
      { role: "user", content: expandUserPrompt(brief, plan, essay) },
    ], {
      temperature: 0.3,
      label: "expand",
      maxTokens: completionTokensForLength(plan.wordCountTarget),
      meter,
      supportedParams,
    })).content;
    const next = stripLeadingTitle(content);
    return bodyWordCount(next) > words ? next : essay;
  } catch (error) {
    if (error instanceof CutOffReply) return essay;
    throw error;
  }
}

export async function fitLength(
  essay: string,
  brief: Brief,
  notes: readonly SourceNote[],
  plan: EssayPlan,
  model: ModelConfig,
  meter?: RunMeter,
  supportedParams?: readonly string[],
): Promise<string> {
  const expanded = await expandIfShort(
    essay,
    brief,
    notes,
    plan,
    model,
    meter,
    supportedParams,
  );
  const words = bodyWordCount(expanded);
  if (
    words <= essayLengthCeiling(plan.wordCountTarget) || !model.apiKey
  ) {
    return expanded;
  }
  try {
    const content = (await streamChat(model, [
      systemMessage(formatAttributedNotes(notes), DRAFT_SYSTEM, brief),
      { role: "user", content: shortenUserPrompt(brief, plan, expanded) },
    ], {
      temperature: 0.2,
      label: "shorten",
      maxTokens: completionTokensForLength(plan.wordCountTarget),
      meter,
      supportedParams,
    })).content;
    const next = stripLeadingTitle(content);
    const nextWords = bodyWordCount(next);
    if (
      nextWords >= essayLengthFloor(plan.wordCountTarget) && nextWords < words
    ) {
      return next;
    }
    return expanded;
  } catch (error) {
    if (error instanceof CutOffReply) return expanded;
    throw error;
  }
}
