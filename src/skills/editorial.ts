import { streamChat } from "../complete.ts";
import { ResolvedProvider } from "../providers.ts";

export interface StyleRules {
  name: string;
  rules: string[];
  transformation: string;
  sample: string;
}

export const styles: Record<string, StyleRules> = {
  economist: {
    name: "Economist",
    rules: ["active voice", "omits needless words", "direct", "no passive voice", "strong verbs"],
    transformation: "Remove hedging words (very, really, quite), eliminate passive voice, replace weak verbs with strong ones",
    sample: "Markets react sharply when policy shifts.",
  },
  "strunk-white": {
    name: "Strunk & White",
    rules: ["active voice", "positive form", "specific", "omit needless words"],
    transformation: "Convert to active voice, remove unnecessary adjectives, make abstract concepts concrete",
    sample: "Prefer the active voice and cut every needless word.",
  },
  monocle: {
    name: "Monocle",
    rules: ["optimistic", "solutions-oriented", "forward-looking"],
    transformation: "Emphasize opportunities over problems, use forward-looking language, add constructive framing",
    sample: "The best cities turn constraints into everyday advantages.",
  },
  professional: {
    name: "Professional",
    rules: ["formal", "precise", "objective"],
    transformation: "Maintain formal tone, use precise terminology, avoid colloquialisms",
    sample: "The report summarizes findings without editorializing.",
  },
};

export const applyEditorialStyle = async (
  text: string,
  styleName: string,
  model: ResolvedProvider,
  wordCountTarget: number,
): Promise<string> => {
  const style = styles[styleName] || styles.professional;
  let result = text;

  if (model.apiKey) {
    const edited = await streamChat(model, [
      {
        role: "system",
        content: `Apply ${style.name} style rules: ${style.rules.join(", ")}. Transformation goal: ${style.transformation}. Example sentence: ${style.sample}`,
      },
      {
        role: "user",
        content: `Edit this text to match the style. Target length: ${wordCountTarget} words.\n\n${text}`,
      },
    ], { temperature: 0.3, label: `style:${styleName}` });
    result = edited || result;
  }

  return result;
};
