import { essayLengthFloor } from "../contract.ts";
import { CutOffReply, type RunMeter, streamChat } from "../complete.ts";
import {
  countWords,
  endsAsSentence,
  exclusiveNoteParagraphs,
  isSourceCollage,
  stripLeadingTitle,
  systemMessage,
  writerFacts,
} from "../agents/write.ts";
import { ResolvedProvider } from "../providers.ts";
import {
  isStyleName,
  type StyleRules,
  styles,
  styleSystemPrompt,
} from "./styles.ts";

export { type StyleRules, styles, styleSystemPrompt };

const STYLE_STUB_WORDS = 80;

export function keepIfNotShortened(
  original: string,
  edited: string,
  floorWords = 0,
): string {
  const next = edited.trim();
  if (!next) return original;
  const nextWords = countWords(next);
  const originalWords = countWords(original);
  if (originalWords < 200) {
    if (nextWords < originalWords * 0.5 || nextWords < floorWords) {
      return original;
    }
    return next;
  }
  const floor = Math.max(STYLE_STUB_WORDS, floorWords);
  if (nextWords < floor || !endsAsSentence(next)) return original;
  return next;
}

export function styleUserPrompt(
  text: string,
  wordCountTarget: number,
  topic = "",
): string {
  const current = countWords(text);
  return [
    topic
      ? `Edit this into one essay about: ${topic}.`
      : "Edit this into one essay.",
    "The opening states one claim about that topic. Every paragraph advances that claim. Do not give each source its own paragraph.",
    "Cut praise, a repeated point, an unfinished sentence, and any sentence about the researchers, the working group, or the paper itself.",
    "Do not repeat the title. Do not use an abbreviation you have not written out.",
    "You may shape the opening and the close only from facts already in the draft. Do not invent statistics, studies, quotes, or sources. You may keep argument and general knowledge already in the draft. Cut praise and repetition.",
    `It is ${current} words. Keep at least ${
      essayLengthFloor(wordCountTarget)
    } words. Cut praise and repetition, not the facts that make the length.`,
    "Do not write source titles or new markdown links. Keep a markdown link already in the draft. Return only the rewritten draft.",
  ].join("\n\n");
}

export function collapseUserPrompt(topic: string): string {
  return [
    topic
      ? `Rewrite this as one essay about: ${topic}.`
      : "Rewrite this as one essay.",
    "The draft is a source survey. That is rejected.",
    "Three or four paragraphs. The first states one claim. Later paragraphs use facts from more than one note.",
    "Do not give a note its own paragraph. Do not start a sentence with a definition.",
    "Cut praise. Close on a fact already in the draft. Do not invent statistics, studies, quotes, or sources. You may keep argument and general knowledge already in the draft. Return only the essay.",
  ].join("\n\n");
}

export const applyEditorialStyle = async (
  text: string,
  styleName: string,
  model: ResolvedProvider,
  wordCountTarget: number,
  meter?: RunMeter,
  floorWords = 0,
  notes = "",
  topic = "",
): Promise<string> => {
  const style = isStyleName(styleName)
    ? styles[styleName]
    : styles.professional;
  let result = text;

  if (model.apiKey) {
    let edited = "";
    try {
      const instruction = `${styleSystemPrompt(style)}\n\nDraft:\n${text}`;
      edited = (await streamChat(model, [
        notes
          ? systemMessage(writerFacts(notes), instruction)
          : { role: "system", content: instruction },
        {
          role: "user",
          content: styleUserPrompt(text, wordCountTarget, topic),
        },
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
    const kept = keepIfNotShortened(text, edited, floorWords);
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

  if (!notes || !model.apiKey || !isSourceCollage(result, notes)) return result;
  console.log(`[style:${styleName}] source collage; rewriting as one essay`);
  let collapsed = "";
  try {
    collapsed = (await streamChat(model, [
      systemMessage(
        writerFacts(notes),
        `${styleSystemPrompt(style)}\n\nDraft:\n${result}`,
      ),
      { role: "user", content: collapseUserPrompt(topic) },
    ], {
      temperature: 0.2,
      label: `style:${styleName}:essay`,
      maxTokens: 4096,
      meter,
    })).content;
  } catch (error) {
    if (!(error instanceof CutOffReply)) throw error;
    console.log(`[style:${styleName}] discarded cut-off collage rewrite`);
    return result;
  }
  const next = stripLeadingTitle(collapsed);
  const words = countWords(next);
  const before = exclusiveNoteParagraphs(result, notes);
  const after = exclusiveNoteParagraphs(next, notes);
  const improved = after < before || !isSourceCollage(next, notes);
  if (!endsAsSentence(next) || words < Math.max(80, floorWords) || !improved) {
    console.log(
      `[style:${styleName}] collage rewrite rejected (${words} words, exclusive ${before} -> ${after})`,
    );
    return result;
  }
  console.log(
    `[style:${styleName}] collage rewritten (${countWords(result)} -> ${
      countWords(next)
    })`,
  );
  return next;
};
