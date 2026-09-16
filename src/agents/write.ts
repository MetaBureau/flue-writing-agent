import { streamChat, type CompletionTarget } from "../complete.ts";

export type SourceNotes = { readonly text: string };
export type EditorialStyle = "economist" | "strunk-white" | "monocle" | "professional";
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

const FALLBACK_OUTLINE = (topic: string): Outline => ({
  title: topic.split(" ").slice(0, 4).join(" "),
  sections: ["Introduction", "Key Developments", "Technical Analysis", "Implications"],
  wordCountTarget: 800,
});

function isOutline(value: unknown): value is Outline {
  if (typeof value !== "object" || value === null) return false;
  if (!("title" in value) || !("sections" in value) || !("wordCountTarget" in value)) return false;
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

export function outlineUserPrompt(notes: string): string {
  return `Create a thoughtful outline for a blog post about: ${notes}\n\nReturn JSON: {title: string, sections: string[], wordCountTarget: number}`;
}

export const generateOutline = async (
  _ctx: unknown,
  notes: SourceNotes,
  model: ModelConfig,
): Promise<Outline> => {
  const topic = notes.text;
  if (!model.apiKey) {
    console.warn(`${model.name} key not set, using heuristic outline`);
    return FALLBACK_OUTLINE(topic);
  }

  const content = await streamChat(model, [
    { role: "system", content: "You generate structured outlines for blog posts." },
    { role: "user", content: outlineUserPrompt(topic) },
  ], { temperature: 0.7, label: "outline" });

  const outline = parseOutline(content, topic);
  const requestedWords = topic.match(/(\d+)\s*words/i);
  if (requestedWords) outline.wordCountTarget = Number(requestedWords[1]);
  return outline;
};

export const generateDrafts = async (
  _ctx: unknown,
  outline: Outline,
  model: ModelConfig,
  notes: SourceNotes,
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
    { name: "conversational", instruction: "Write in a friendly, conversational tone" },
    { name: "professional", instruction: "Write in a professional, business-appropriate tone" },
    { name: "analytical", instruction: "Write in an analytical, data-focused tone" },
  ];

  const drafts: Draft[] = [];
  for (const { name, instruction } of styles) {
    const content = await streamChat(model, [
      { role: "system", content: "You write blog post drafts." },
      {
        role: "user",
        content:
          `Write a ${instruction} draft about: ${outline.title}\n\nOutline:\n${JSON.stringify(outline.sections)}\n\nSource notes:\n${notes.text}\n\nTarget: ${outline.wordCountTarget} words. Do not stop early.`,
      },
    ], { temperature: 0.8, label: `draft:${name}` });
    drafts.push({ style: name, content: content || "Draft content placeholder" });
  }

  return drafts;
};

export function pickDraft(drafts: Draft[], style: EditorialStyle): Draft {
  const voice = VOICE_FOR_STYLE[style];
  return drafts.find((draft) => draft.style === voice) ?? drafts[0];
}
