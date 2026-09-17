export interface StyleRules {
  name: string;
  rules: string[];
  transformation: string;
  sample: string;
}

export const STYLE_NAMES = [
  "economist",
  "strunk-white",
  "monocle",
  "professional",
] as const;
export type StyleName = (typeof STYLE_NAMES)[number];

export const styles: Record<StyleName, StyleRules> = {
  economist: {
    name: "Economist",
    rules: [
      "active voice",
      "omits needless words",
      "direct",
      "no passive voice",
      "strong verbs",
    ],
    transformation:
      "Use active voice and short sentences. Cut praise, passion, mission statements, and repeated points. Keep names and numbers already in the draft",
    sample: "Markets react sharply when policy shifts.",
  },
  "strunk-white": {
    name: "Strunk & White",
    rules: ["active voice", "positive form", "specific", "omit needless words"],
    transformation:
      "Convert to active voice, remove unnecessary adjectives, make abstract concepts concrete",
    sample: "Prefer the active voice and cut every needless word.",
  },
  monocle: {
    name: "Monocle",
    rules: ["optimistic", "solutions-oriented", "forward-looking"],
    transformation:
      "Emphasize opportunities over problems, use forward-looking language, add constructive framing",
    sample: "The best cities turn constraints into everyday advantages.",
  },
  professional: {
    name: "Professional",
    rules: ["formal", "precise", "objective"],
    transformation:
      "Maintain formal tone, use precise terminology, avoid colloquialisms",
    sample: "The report summarizes findings without editorializing.",
  },
};

export function isStyleName(value: string): value is StyleName {
  return (STYLE_NAMES as readonly string[]).includes(value);
}

export function styleFromData(
  data: { style?: string } | undefined,
): { key: StyleName; rules: StyleRules } {
  const requested = data?.style;
  const key = requested && isStyleName(requested) ? requested : "economist";
  return { key, rules: styles[key] };
}

export function styleSystemPrompt(style: StyleRules): string {
  return `Apply ${style.name} style rules: ${
    style.rules.join(", ")
  }. Transformation goal: ${style.transformation}. Example sentence: ${style.sample} Do not invent statistics, studies, quotes, or sources. You may keep argument and general knowledge already in the draft. Cut praise and repetition.`;
}
