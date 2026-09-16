import { CutOffReply, type RunMeter, streamChat } from "../complete.ts";
import { countWords, endsAsSentence } from "../agents/write.ts";
import { ResolvedProvider } from "../providers.ts";
import {
  isStyleName,
  type StyleRules,
  styles,
  styleSystemPrompt,
} from "./styles.ts";

export { type StyleRules, styles, styleSystemPrompt };

const STYLE_STUB_WORDS = 80;

export function keepIfNotShortened(original: string, edited: string): string {
  const next = edited.trim();
  if (!next) return original;
  const nextWords = countWords(next);
  const originalWords = countWords(original);
  if (originalWords < 200) {
    if (nextWords < originalWords * 0.5) return original;
    return next;
  }
  if (nextWords < STYLE_STUB_WORDS || !endsAsSentence(next)) return original;
  return next;
}

export function styleUserPrompt(text: string, wordCountTarget: number): string {
  const current = countWords(text);
  return [
    "Rewrite into the style. Cut praise, passion, mission statements, and sentences that repeat a point already made.",
    "Drop ads, author biographies, view counts, music credits, and any sentence that is not about the subject.",
    "Keep names, numbers, URLs, and product claims.",
    "Do not add facts, sections, or a conclusion.",
    `It is ${current} words. Do not pad it toward ${wordCountTarget} words.`,
    text,
  ].join("\n\n");
}

export const applyEditorialStyle = async (
  text: string,
  styleName: string,
  model: ResolvedProvider,
  wordCountTarget: number,
  meter?: RunMeter,
): Promise<string> => {
  const style = isStyleName(styleName)
    ? styles[styleName]
    : styles.professional;
  let result = text;

  if (model.apiKey) {
    let edited = "";
    try {
      edited = (await streamChat(model, [
        { role: "system", content: styleSystemPrompt(style) },
        { role: "user", content: styleUserPrompt(text, wordCountTarget) },
      ], {
        temperature: 0.2,
        label: `style:${styleName}`,
        maxTokens: 4096,
        meter,
      })).content;
    } catch (error) {
      if (!(error instanceof CutOffReply)) throw error;
      console.log(`[style:${styleName}] discarded cut-off reply`);
      return text;
    }
    const kept = keepIfNotShortened(text, edited);
    if (kept === text && edited.trim()) {
      console.log(
        `[style:${styleName}] discarded rewrite (${countWords(edited)} words)`,
      );
    } else if (countWords(kept) < countWords(text)) {
      console.log(
        `[style:${styleName}] kept the cut (${countWords(text)} -> ${
          countWords(kept)
        })`,
      );
    }
    result = kept;
  }

  return result;
};
