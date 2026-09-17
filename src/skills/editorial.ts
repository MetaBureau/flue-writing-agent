import type { Brief } from "../brief.ts";
import { lengthRange } from "../contract.ts";
import { CutOffReply, type RunMeter, streamChat } from "../complete.ts";
import {
  briefBlock,
  BRIEF_ASK,
  CLAIM_ADVANCE,
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
  brief: Brief,
): string {
  const current = countWords(text);
  return [
    briefBlock(brief),
    `Edit this into the essay the brief asks for. ${BRIEF_ASK}`,
    `${CLAIM_ADVANCE} Do not give each source its own paragraph.`,
    "Cut empty praise and filler; keep humour, irony, and tone the brief asks for. Cut a repeated point, an unfinished sentence, and any sentence about the researchers, the working group, or the paper itself.",
    "Do not repeat the title. Do not use an abbreviation you have not written out.",
    "You may shape the opening and the close only from facts already in the draft. Do not invent statistics, studies, quotes, or sources. You may keep argument and general knowledge already in the draft.",
    `It is ${current} words. ${
      lengthRange(wordCountTarget)
    } Cut empty praise and filler, not the facts that make the length.`,
    "Do not write source titles, URLs, markdown links, or a call to action. Return only the rewritten draft.",
  ].join("\n\n");
}

export function collapseUserPrompt(
  brief: Brief,
  wordCountTarget = 0,
): string {
  return [
    briefBlock(brief),
    `Rewrite this as the essay the brief asks for. ${BRIEF_ASK}`,
    wordCountTarget > 0 ? lengthRange(wordCountTarget) : "",
    "The draft is a source survey. That is rejected.",
    `Three or four paragraphs. ${CLAIM_ADVANCE} Later paragraphs use facts from more than one note.`,
    "Do not give a note its own paragraph. Do not start a sentence with a definition.",
    "Cut empty praise and filler; keep humour, irony, and tone the brief asks for. Close in a way that serves the brief's purpose. Do not invent statistics, studies, quotes, or sources. Do not paste a call to action or a URL. You may keep argument and general knowledge already in the draft. Return only the essay.",
  ].filter(Boolean).join("\n\n");
}

export const applyEditorialStyle = async (
  text: string,
  styleName: string,
  model: ResolvedProvider,
  wordCountTarget: number,
  brief: Brief,
  meter?: RunMeter,
  floorWords = 0,
  notes = "",
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
        systemMessage(writerFacts(notes), instruction, brief),
        {
          role: "user",
          content: styleUserPrompt(text, wordCountTarget, brief),
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
        brief,
      ),
      { role: "user", content: collapseUserPrompt(brief, wordCountTarget) },
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
