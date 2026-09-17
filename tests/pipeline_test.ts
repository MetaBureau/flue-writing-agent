/// <reference lib="deno.ns" />
import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@^1.0.19";
import {
  acceptedDrafts,
  acceptExpansion,
  acceptWovenEssay,
  assertEssayLength,
  bodyWordCount,
  cachedPrefix,
  capEssayLength,
  cleanEssayBody,
  countWords as countDraftWords,
  dropCallsToAction,
  essayReadyToSave,
  describesSourcePage,
  type Draft,
  draftingNotes,
  draftUserPrompt,
  essayMarkdown,
  expansionTokenBudget,
  extensionUserPrompt,
  extendShouldContinue,
  extendShouldStop,
  extendToTarget,
  factualNotes,
  finishEssay,
  fitExtension,
  groundedInNote,
  isAppendedDump,
  isCallToAction,
  stripBodyLinks,
  isProseExpansion,
  isSourceCollage,
  longestDraft,
  mergeExtension,
  notesRecord,
  OUTLINE_MAX_TOKENS,
  outlineUserPrompt,
  pickSynthesizedText,
  publishedTitle,
  repeatsDraft,
  stageSystem,
  stripLeadingTitle,
  SYNTHESIS_MAX_TOKENS,
  synthesisTokens,
  synthesisUserPrompt,
  systemMessage,
  topicBrief,
  weaveUserPrompt,
  wordCountFromTopic,
  wordsToAsk,
  writerFacts,
} from "../src/agents/write.ts";
import {
  briefCheckFromContent,
  briefCheckUserPrompt,
  briefMustRevise,
  briefRevisionUserPrompt,
  isLengthMiss,
  parseBrief,
  researchQuery,
  type Brief,
} from "../src/brief.ts";
import {
  catalogFromHub,
  keyListWarning,
  pickerLabel,
  pickerModels,
  reasoningEffortField,
} from "../src/catalog.ts";
import {
  cacheSystemMessages,
  completionRequestBody,
  estimateUsd,
  responseFormatField,
  RunMeter,
  usageFromPayload,
} from "../src/complete.ts";
import {
  applyFactCheck,
  checkClaims,
  checkerReplacement,
  checkModelId,
  citableHits,
  claimBatches,
  factcheckRecord,
  factcheckTokenCap,
  factcheckUserPrompt,
  markdownLink,
  splitClaims,
  uncheckedResult,
  verdictsFromContent,
} from "../src/factcheck.ts";
import {
  collapseUserPrompt,
  keepIfNotShortened,
  styleUserPrompt,
} from "../src/skills/editorial.ts";
import { styleSystemPrompt, styles } from "../src/skills/styles.ts";
import {
  DEFAULT_ESSAY_LENGTH,
  draftPiece,
  ESSAY_LENGTHS,
  essayLengthCeiling,
  essayLengthFloor,
  essayPiece,
  isEssayLength,
  notesPiece,
  pieceRank,
  synthesisPiece,
  WRITE_STAGES,
} from "../src/contract.ts";
import { countWords, topicSlug } from "../src/main.ts";
import {
  acceptPromptTurn,
  essayPrompt,
  fallbackQuestion,
  parsePromptTurn,
  PROMPT_MAX_TURNS,
  PROMPT_SYSTEM,
  promptUserMessage,
} from "../src/prompt.ts";
import {
  claimText,
  hitsFromPayload,
  mergeHits,
  noteWordCount,
  relevantToQuery,
  researchBudget,
  searchQuery,
  sourceNotes,
} from "../src/research.ts";

Deno.test("acceptedDrafts keeps fulfilled drafts and throws if none succeed", () => {
  const good: Draft = { model: "kept", content: "Enough words here to keep." };
  assertEquals(
    acceptedDrafts([
      { status: "rejected", reason: new Error("fail") },
      { status: "fulfilled", value: { model: "empty", content: "  " } },
      { status: "fulfilled", value: good },
    ]),
    [good],
  );
  assertThrows(
    () =>
      acceptedDrafts([
        { status: "rejected", reason: new Error("fail") },
        { status: "fulfilled", value: { model: "empty", content: "" } },
      ]),
    Error,
    "No drafts succeeded",
  );
});

Deno.test("longestDraft prefers more words and keeps the first tie", () => {
  const drafts: Draft[] = [
    { model: "short", content: "one two" },
    { model: "long", content: "one two three four five" },
    { model: "also-long", content: "six seven eight nine ten" },
  ];
  assertEquals(longestDraft(drafts).model, "long");
  assertEquals(
    longestDraft([
      { model: "a", content: "one two three" },
      { model: "b", content: "four five six" },
    ]).model,
    "a",
  );
  assertThrows(() => longestDraft([]), Error, "No drafts");
});

Deno.test("pickSynthesizedText uses the reply or the longest draft", () => {
  const drafts: Draft[] = [
    { model: "short", content: "one two" },
    { model: "long", content: "one two three four five" },
  ];
  assertEquals(pickSynthesizedText("  Synthesized.  ", drafts), {
    content: "Synthesized.",
    fallback: false,
  });
  assertEquals(pickSynthesizedText("  ", drafts), {
    content: "one two three four five",
    fallback: true,
  });
});

Deno.test("prompt interview asks one question and does not invent", () => {
  assertStringIncludes(PROMPT_SYSTEM, "Ask one question at a time");
  assertStringIncludes(PROMPT_SYSTEM, "Do not invent a fact");
  assertStringIncludes(PROMPT_SYSTEM, "Do not ask about length");
  assertEquals(PROMPT_MAX_TURNS, 5);
  const first = promptUserMessage({
    seed: "pet cats",
    turns: [],
    force: false,
  });
  assertStringIncludes(first, "Ask the first question");
  assertStringIncludes(first, "Subject: pet cats");
  const finish = promptUserMessage({
    seed: "pet cats",
    turns: [{ question: "Who should read this?", answer: "The owner." }],
    force: true,
  });
  assertStringIncludes(finish, "Finish now");
  assertStringIncludes(finish, "The owner.");
  const asked = parsePromptTurn(
    '```json\n{"status":"ask","question":"Who is it for?"}\n```',
  );
  assertEquals(asked, { status: "ask", question: "Who is it for?" });
  assertEquals(
    parsePromptTurn(
      '{"status":"ready","prompt":"How to write an essay about cats."}',
    ),
    undefined,
  );
  const prompt = essayPrompt("pet cats", [{
    question: "Who should read this?",
    answer: "The owner.",
  }]);
  assertStringIncludes(prompt, "pet cats.");
  assertStringIncludes(prompt, "The owner.");
  assertEquals(
    acceptPromptTurn("pet cats", [], "not json", false).status,
    "ask",
  );
  assertEquals(
    acceptPromptTurn(
      "pet cats",
      [],
      '{"status":"ask","question":"Again?"}',
      true,
    ).status,
    "ready",
  );
  assertEquals(fallbackQuestion([]), "Who should read this, and why them?");
});

Deno.test("form essay lengths default to 900", () => {
  assertEquals(
    [...ESSAY_LENGTHS],
    [500, 700, 900, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000],
  );
  assertEquals(DEFAULT_ESSAY_LENGTH, 900);
  assertEquals(isEssayLength(900), true);
  assertEquals(isEssayLength(300), false);
  assertEquals(isEssayLength(250), false);
});

Deno.test("piece files match the saved essay and notes names", () => {
  const slug = topicSlug("Write a 900 word essay about pet cats");
  assertEquals(essayPiece(slug, "# Title\n").filename, `${slug}.md`);
  assertEquals(essayPiece(slug, "# Title\n").label, "Essay");
  assertEquals(essayPiece(slug, "# Title\n", 469).label, "Essay · 469 words");
  assertEquals(notesPiece(slug, "notes\n").filename, `${slug}.notes.md`);
  const draft = draftPiece(
    slug,
    "anthropic/claude-haiku-4-5",
    "Cats sleep.",
    "Claude Haiku 4.5",
  );
  assertEquals(draft.id, "draft:claude-haiku-4-5");
  assertStringIncludes(draft.filename, "draft-claude-haiku-4-5");
  assertEquals(draft.label, "Claude Haiku 4.5");
  assertStringIncludes(draft.markdown, "# Claude Haiku 4.5");
  assertStringIncludes(draft.markdown, "Cats sleep.");
  assertFalse(draft.label.toLowerCase().includes("selected"));
  assertFalse(draft.markdown.toLowerCase().includes("selected"));
  assertEquals(synthesisPiece(slug, "Body.").filename, `${slug}.synthesis.md`);
  assertEquals(
    WRITE_STAGES.map((stage) => stage.id),
    [
      "brief",
      "research",
      "outline",
      "drafts",
      "synthesis",
      "extend",
      "style",
      "briefcheck",
      "factcheck",
    ],
  );
  assertEquals(pieceRank("notes"), 0);
  assertEquals(pieceRank("draft:claude-haiku-4-5"), 1);
  assertEquals(pieceRank("synthesis"), 2);
  assertEquals(pieceRank("briefcheck"), 3);
  assertEquals(pieceRank("essay"), 4);
});

Deno.test("topicSlug keeps the first six words", () => {
  assertEquals(
    topicSlug("Write an 800 word blog post about flue agent extra"),
    "write-an-800-word-blog-post",
  );
});

Deno.test("countWords ignores extra spaces", () => {
  assertEquals(countWords("one two  three"), 3);
});

Deno.test("outlineUserPrompt includes notes without OpenCall", () => {
  const notes = "The Flue agent is a Deno CLI.";
  const prompt = outlineUserPrompt(topicBrief("Flue"));
  assertStringIncludes(stageSystem(notes, "instruction", topicBrief("Flue")), notes);
  assertFalse(prompt.includes(notes));
  assertStringIncludes(prompt, "Write the essay the brief asks for.");
  assertStringIncludes(prompt, "900-word essay");
  assertStringIncludes(prompt, "Draw specific facts, figures, quotes, and named studies from the notes");
  assertStringIncludes(prompt, "one claim about that topic");
  assertStringIncludes(prompt, "Do not invent a statistic, a study, a quote, or a source");
  assertStringIncludes(prompt, "Four sections at most");
  assertFalse(prompt.includes("OpenCall"));
  assertFalse(prompt.includes("thoughtful"));
  assertFalse(prompt.includes("The essay is about:"));
});

Deno.test("draft prompt stays in the notes and sets a floor", () => {
  const prompt = draftUserPrompt(
    {
      title: "Flue",
      sections: ["Five calls"],
      wordCountTarget: 900,
    },
  );
  assertStringIncludes(prompt, "Write about 900 words");
  assertStringIncludes(prompt, "one claim about that topic");
  assertStringIncludes(
    prompt,
    "Notes are the source for specific facts, figures, quotes, and named studies",
  );
  assertStringIncludes(prompt, "Do not invent statistics, studies, quotes, or sources");
  assertFalse(prompt.includes("Write in an analytical, data-focused tone"));
  assertStringIncludes(prompt, "Close in a way that serves the brief's purpose");
  assertStringIncludes(
    stageSystem(
      "The pipeline is five model calls.",
      "instruction",
      topicBrief("Flue"),
    ),
    "The pipeline is five model calls.",
  );
  assertFalse(prompt.includes("The pipeline is five model calls."));
});

Deno.test("style prompt keeps the length floor", () => {
  const prompt = styleUserPrompt(
    "The pipeline is five model calls.",
    900,
    topicBrief("elites and politics"),
  );
  assertStringIncludes(prompt, "Do not invent statistics, studies, quotes, or sources");
  assertStringIncludes(prompt, "Write the essay the brief asks for.");
  assertStringIncludes(prompt, "one claim about that topic");
  assertStringIncludes(prompt, "Cut empty praise and filler");
  assertFalse(prompt.includes("Cut praise"));
  assertStringIncludes(prompt, "between 765 and 1035 words");
  assertFalse(prompt.includes("Keep a markdown link"));
  assertStringIncludes(prompt, "call to action");
});

Deno.test("weave prompt returns the full essay", () => {
  const prompt = weaveUserPrompt(
    topicBrief("elites and politics"),
    "Political elites set the agenda.",
    900,
  );
  assertStringIncludes(prompt, "Write the essay the brief asks for.");
  assertFalse(prompt.includes("The essay is about:"));
  assertStringIncludes(prompt, "between 765 and 1035 words");
  assertStringIncludes(prompt, "until the essay is inside that range");
  assertStringIncludes(prompt, "Do not add a paragraph for each source");
  assertStringIncludes(prompt, "Do not invent statistics, studies, quotes, or sources");
  assertStringIncludes(prompt, "Return only the essay");
});

Deno.test("synthesis prompt includes each draft and the target length", () => {
  const prompt = synthesisUserPrompt(topicBrief("pet cats"), {
    title: "Pet cats",
    sections: ["Opening", "Body", "Close"],
    wordCountTarget: 900,
  }, [
    { model: "anthropic/claude-haiku-4-5", content: "Haiku draft body." },
    { model: "mistralai/mistral-large-2512", content: "Mistral draft body." },
    { model: "moonshotai/kimi-k2-0905", content: "Kimi draft body." },
  ]);
  assertStringIncludes(prompt, "Haiku draft body.");
  assertStringIncludes(prompt, "Mistral draft body.");
  assertStringIncludes(prompt, "Kimi draft body.");
  assertStringIncludes(prompt, "Draft A:");
  assertStringIncludes(prompt, "between 765 and 1035 words");
  assertFalse(prompt.includes("anthropic/claude-haiku-4-5"));
  assertFalse(prompt.includes("mistralai/mistral-large-2512"));
  assertFalse(prompt.includes("moonshotai/kimi-k2-0905"));
});

const FROG_BRIEF: Brief = {
  text:
    "Pet frogs are magical creatures. Write an essay for an audience of intellectuals with the purpose of providing amusement, focusing on the claim that these animals possess a magical quality.",
  subject: "pet frogs",
  claim: "these animals possess a magical quality",
  audience: "intellectuals",
  purpose: "providing amusement",
  tone: "",
  constraints: [],
};

function assertBriefContract(prompt: string) {
  assertStringIncludes(prompt, FROG_BRIEF.text);
  assertStringIncludes(
    prompt,
    "Stage rules below are defaults. Where a rule conflicts with the brief's audience, purpose, tone, or constraints, follow the brief.",
  );
  assertStringIncludes(prompt, "Never break the grounding rule");
  assertFalse(prompt.includes("The essay is about:"));
}

Deno.test("stage prompts carry the frog brief and its precedence", () => {
  const outline = {
    title: "Pet frogs",
    sections: ["Opening"],
    wordCountTarget: 1200,
  };
  const drafts: Draft[] = [{ model: "a", content: "Frogs gleam." }];
  const essay = "A frog waits on the pond.";
  const prompts = [
    outlineUserPrompt(FROG_BRIEF, 1200),
    draftUserPrompt(outline, FROG_BRIEF),
    synthesisUserPrompt(FROG_BRIEF, outline, drafts),
    weaveUserPrompt(FROG_BRIEF, essay, 1200),
    extensionUserPrompt(essay, "A note.", 1200, 80, FROG_BRIEF),
    styleUserPrompt(essay, 1200, FROG_BRIEF),
    collapseUserPrompt(FROG_BRIEF),
    briefRevisionUserPrompt(FROG_BRIEF, essay, ["too earnest"]),
    briefCheckUserPrompt(FROG_BRIEF, essay),
  ];
  for (const prompt of prompts) assertBriefContract(prompt);
  assertStringIncludes(
    styleSystemPrompt(styles.economist),
    "Cut empty praise and filler; keep humour, irony, and tone the brief asks for.",
  );
  assertFalse(styleSystemPrompt(styles.economist).includes("Cut praise"));
  assertFalse(styleUserPrompt(essay, 1200, FROG_BRIEF).includes("Cut praise"));
  const prefix = cachedPrefix(FROG_BRIEF, "A frog fact.");
  assertEquals(
    prefix.startsWith("Brief (from the user; it governs every choice below):"),
    true,
  );
  assertStringIncludes(prefix, FROG_BRIEF.text);
  assertStringIncludes(prefix, "Research notes:\nA frog fact.");
  const message = systemMessage("A frog fact.", "instruction", FROG_BRIEF);
  assertEquals(message.cachedPrefix, prefix);
  assertStringIncludes(
    cachedPrefix(topicBrief(""), "A frog fact."),
    "Research notes:\nA frog fact.",
  );
  assertStringIncludes(
    briefCheckUserPrompt(FROG_BRIEF, "Frogs gleam."),
    "pasted source text",
  );
  assertStringIncludes(
    briefCheckUserPrompt(FROG_BRIEF, "Frogs gleam."),
    "does not serve the claim",
  );
  assertStringIncludes(
    briefCheckUserPrompt(FROG_BRIEF, "Frogs gleam."),
    "Measured length: 2 words",
  );
  assertStringIncludes(
    briefCheckUserPrompt(FROG_BRIEF, "Frogs gleam."),
    "actual wit",
  );
  assertStringIncludes(
    synthesisUserPrompt(FROG_BRIEF, {
      title: "Frogs",
      sections: ["Opening"],
      wordCountTarget: 1200,
    }, [{ model: "a", content: "A draft." }]),
    "Repetition is a fault",
  );
  const query = researchQuery(FROG_BRIEF);
  assertStringIncludes(query, "pet frogs");
  assertStringIncludes(query, "magical");
  assertFalse(query === "pet frogs");
});

Deno.test("brief parse falls back and brief-check JSON can be skipped", async () => {
  const parsed = await parseBrief(FROG_BRIEF.text, {
    name: "HaiMaker",
    provider: "haimaker",
    modelId: "openai/gpt-4.1",
    baseUrl: "https://api.haimaker.ai/v1",
    apiKey: undefined,
  });
  assertEquals(parsed.text, FROG_BRIEF.text);
  assertStringIncludes(parsed.subject.toLowerCase(), "pet frogs");
  assertFalse(/^write\b/i.test(parsed.subject));
  assertEquals(parsed.audience, "");
  assertEquals(
    briefCheckFromContent(JSON.stringify({ pass: true, misses: [] })),
    { pass: true, misses: [] },
  );
  assertEquals(
    briefCheckFromContent(JSON.stringify({
      pass: false,
      misses: ["too earnest"],
    })),
    { pass: false, misses: ["too earnest"] },
  );
  assertEquals(briefCheckFromContent("not json"), undefined);
  assertEquals(
    briefCheckFromContent(JSON.stringify({ pass: false })),
    undefined,
  );
});

Deno.test("word count defaults to 900 unless the topic names a count", () => {
  assertEquals(wordCountFromTopic("The Flue agent is a Deno CLI."), 900);
  assertEquals(wordCountFromTopic("Write 200 words about Flue."), 200);
});

Deno.test("essay length floor is 85 percent of the request", () => {
  assertEquals(essayLengthFloor(900), 765);
  assertEquals(essayLengthFloor(DEFAULT_ESSAY_LENGTH), 765);
  assertEquals(
    bodyWordCount(
      "# Title\n\n3 words\n\nOne two three.\n\n## Sources\n\n- [A long listed source title](https://a.example/path)",
    ),
    3,
  );
  assertEquals(
    bodyWordCount("One two three.\n\n## Sources\n\n- [A](https://a.example)"),
    3,
  );
  assertThrows(
    () => assertEssayLength("one two three", 900),
    Error,
    "Essay is 3 words; 900 were requested (minimum 765).",
  );
  assertEssayLength("word ".repeat(765), 900);
});

Deno.test("research budget grows with the requested length", () => {
  assertEquals(researchBudget(500), {
    sources: 8,
    excerptWords: 180,
    maxResults: 12,
  });
  assertEquals(researchBudget(900), {
    sources: 9,
    excerptWords: 300,
    maxResults: 13,
  });
  assertEquals(researchBudget(5000), {
    sources: 12,
    excerptWords: 400,
    maxResults: 16,
  });
  assertEquals(
    noteWordCount("Source: A\nURL: https://a.example\none two three"),
    3,
  );
  assertEquals(
    mergeHits(
      [{
        title: "A",
        url: "https://a.example",
        content:
          "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
      }],
      [
        { title: "A", url: "https://a.example", content: "dup" },
        { title: "B", url: "https://b.example", content: "new" },
      ],
    ).map((hit) => hit.url),
    ["https://a.example", "https://b.example"],
  );
});

Deno.test("wordsToAsk asks for more than the shortfall", () => {
  assertEquals(wordsToAsk(600, 900), 450);
  assertEquals(wordsToAsk(900, 900), 0);
});

Deno.test("mergeExtension appends and replaces a full rewrite", () => {
  assertEquals(mergeExtension("Alpha.", "Beta."), "Alpha.\n\nBeta.");
  assertEquals(
    mergeExtension("Alpha stays.", "Alpha stays. And more."),
    "Alpha stays. And more.",
  );
  assertEquals(mergeExtension("Alpha.", "  "), "Alpha.");
});

Deno.test("extendToTarget stops at the floor and does not call when already long", async () => {
  let calls = 0;
  const longEnough = await extendToTarget(
    "one two three four",
    "notes",
    3,
    () => {
      calls += 1;
      return Promise.resolve("unused");
    },
  );
  assertEquals(calls, 0);
  assertEquals(longEnough.words, 4);

  const extended = await extendToTarget("one two three", "notes", 8, () => {
    calls += 1;
    return Promise.resolve("four five six seven eight");
  });
  assertEquals(calls, 1);
  assertEquals(extended.words, 8);
});

Deno.test("extendToTarget stops when an extension adds no words", async () => {
  let calls = 0;
  const stalled = await extendToTarget("one two", "notes", 20, () => {
    calls += 1;
    return Promise.resolve("");
  });
  assertEquals(calls, 1);
  assertEquals(stalled.words, 2);
});

Deno.test("style pass keeps the longer draft", () => {
  assertEquals(
    keepIfNotShortened("one two three four five", "one two"),
    "one two three four five",
  );
  assertEquals(
    keepIfNotShortened("one two three four five", "one two three four six"),
    "one two three four six",
  );
});

Deno.test("style pass keeps a finished cut of a padded draft", () => {
  const padded =
    "The API returns snippets for agents rather than links for people. ".repeat(
      30,
    );
  const cut = "The API returns snippets for agents rather than links. ".repeat(
    16,
  ).trim();
  assertEquals(countDraftWords(padded) >= 200, true);
  assertEquals(countDraftWords(cut) >= 80, true);
  assertEquals(keepIfNotShortened(padded, cut), cut);
  assertEquals(keepIfNotShortened(padded, "Too short."), padded);
  const extended = `${padded} Extra fact from the notes stays in the piece.`;
  const cutToEightyOne = "The API returns snippets for agents. ".repeat(17)
    .trim();
  assertEquals(countDraftWords(cutToEightyOne) > 80, true);
  assertEquals(countDraftWords(cutToEightyOne) < countDraftWords(padded), true);
  assertEquals(
    keepIfNotShortened(extended, cutToEightyOne, countDraftWords(padded)),
    extended,
  );
});

Deno.test("weave keeps a rewritten essay and rejects an appended note dump", () => {
  const sentence =
    "Political elites set the agenda for modern government, and parties decide which problems reach a vote. ";
  const draft = sentence.repeat(12).trim();
  const woven = `${
    sentence.repeat(11)
  }Officials then carry that choice into law, which is the claim of this essay.`
    .trim();
  const dumped =
    `${draft} A working paper on campaign finance lists donor names and filing dates for a different country.`;
  assertEquals(isAppendedDump(draft, dumped), true);
  assertEquals(acceptWovenEssay(draft, dumped), false);
  assertEquals(acceptWovenEssay(draft, woven), true);
  assertEquals(acceptWovenEssay(draft, "not a sentence"), false);
});

Deno.test("a paragraph per note is a source collage", () => {
  const latin =
    "Elites in Latin America change little because the society lacks capacity to carry new policy through to a result.";
  const money =
    "Campaign contributions do not buy Congressional roll call votes, and that finding misses the rest of money in politics.";
  const kenya =
    "Kenyan elites ended the violence of 2008 and then accepted court rulings in later political disputes.";
  const notes = [latin, money, kenya].join("\n\n");
  const survey = [latin, money, kenya].join("\n\n");
  const essay =
    "Elites change outcomes only when the society can carry a decision. In Latin America limited capacity stops new policy, and campaign money in Congress does not buy votes either. Kenya's elites ended the 2008 violence and then accepted court rulings, which is the same limit seen from the other side.";
  assertEquals(isSourceCollage(survey, notes), true);
  assertEquals(isSourceCollage(essay, notes), false);
});

Deno.test("expansion rejects a note that is not about the source paragraph", () => {
  const note =
    "HaiMaker previously failed with HTTP 524, a Cloudflare origin timeout. The auto-router sent writing prompts to step-3.7-flash.";
  const grounded =
    "HaiMaker failed with HTTP 524 because Cloudflare closed the origin while step-3.7-flash reasoned.";
  const invented =
    "The current system architecture utilizes a distributed ledger framework to manage data integrity across multiple nodes.";
  assertEquals(groundedInNote(note, grounded), true);
  assertEquals(groundedInNote(note, invented), false);
  assertEquals(acceptExpansion(note, invented, 80), false);
  const usable =
    "HaiMaker failed with HTTP 524 because Cloudflare closed the origin while step-3.7-flash reasoned for more than a minute before the outline arrived.";
  const longOnTopic = `${usable} ${"detail ".repeat(80)}`;
  assertEquals(groundedInNote(note, longOnTopic), true);
  assertEquals(acceptExpansion(note, usable, 40), true);
  const draft =
    "HaiMaker failed with HTTP 524 because Cloudflare closed the origin while step-3.7-flash reasoned for more than a minute.";
  assertEquals(repeatsDraft(draft, usable), true);
  assertEquals(acceptExpansion(note, usable, 40, draft), false);
  assertEquals(acceptExpansion(note, longOnTopic, 40), false);
  assertEquals(expansionTokenBudget(44), 4096);
  assertEquals(
    countWords(fitExtension(`${usable} This clause never finishes`, 40)) >= 20,
    true,
  );
  assertEquals(
    factualNotes("Write a 900 word blog post.\n\n" + note).length,
    1,
  );
});

Deno.test("search query is short and skips the writing instruction", () => {
  const query = searchQuery(
    "Write a 900 word blog post. Use only these notes.\n\nThe Flue writing agent is a Deno CLI. It has flags.",
  );
  assertEquals(query, "The Flue writing agent is a Deno CLI.");
  assertEquals(searchQuery("essay on my pet cat"), "my pet cat");
  assertEquals(searchQuery("x".repeat(500)).length, 400);
});

Deno.test("source notes keep a URL and drop empty bodies", () => {
  const notes = sourceNotes([
    {
      title: "Tavily",
      url: "https://docs.tavily.com/search",
      content:
        "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
    },
    { title: "Empty", url: "https://example.com", content: "" },
  ]);
  assertStringIncludes(notes, "https://docs.tavily.com/search");
  assertFalse(notes.includes("example.com"));
});

Deno.test("search payload ignores a synthesized answer", () => {
  const hits = hitsFromPayload({
    answer: "This synthesized answer must not become a note.",
    results: [{
      title: "Docs",
      url: "https://docs.tavily.com/search",
      content:
        "Tavily search returns page text for agents. It is not a finished essay. The snippet includes the query and the sources so a writer can quote the page.",
      raw_content:
        "BuildrLabs offers a bootcamp in Colombo. This raw page must not become a note.",
    }],
  });
  assertEquals(hits.length, 1);
  assertFalse(hits[0].content.includes("synthesized answer"));
  assertFalse(hits[0].content.includes("bootcamp"));
  assertStringIncludes(hits[0].content, "page text");
});

Deno.test("research drops a hit that does not name the subject", () => {
  const query = "Tavily Search API for writing agents";
  const docs = {
    title: "Tavily search",
    url: "https://docs.tavily.com",
    content:
      "Tavily returns snippets an agent can quote. The page is long enough to count as a note for the writer today.",
  };
  const ad = {
    title: "Applied AI Bootcamp",
    url: "https://example.com/bootcamp",
    content:
      "The bootcamp runs on Saturdays in Colombo and costs a fixed fee. Seats remain open for professionals who want applied skills.",
  };
  assertEquals(relevantToQuery(query, docs), true);
  assertEquals(relevantToQuery(query, ad), false);
  assertEquals(
    relevantToQuery("my pet cat", {
      title: "Writing a strong college admissions essay",
      url: "https://example.com/admissions",
      content:
        "Students should write about walking a dog or a bus ride. The essay should show a voice. This paragraph is long enough to be a note if the subject matched.",
    }),
    false,
  );
});

Deno.test("claim text drops page furniture and keeps the product sentence", () => {
  const cleaned = claimText(
    "Tavily returns reranked snippets an agent can quote. The video has 5758 views and 112 likes. BuildrLabs offers a bootcamp in Colombo.",
  );
  assertStringIncludes(cleaned, "reranked snippets");
  assertFalse(cleaned.includes("views"));
  assertFalse(cleaned.includes("bootcamp"));
});

Deno.test("completion body caps reasoning tokens and records usage", () => {
  const body = completionRequestBody("google/gemini-3.5-flash", [
    { role: "user", content: "notes" },
  ], {
    temperature: 0.2,
    label: "outline",
    maxTokens: 4096,
    reasoningEffort: "none",
  });
  assertEquals(body.max_completion_tokens, 4096);
  assertEquals("max_tokens" in body, false);
  assertEquals(body.stream_options, { include_usage: true });
  assertEquals("reasoning_effort" in body, false);
  assertEquals("user" in body, false);
  assertEquals(
    responseFormatField(["response_format"], { type: "json_schema" }),
    { response_format: { type: "json_schema" } },
  );
  assertEquals(
    responseFormatField(["temperature"], { type: "json_schema" }),
    {},
  );
  const cached = cacheSystemMessages("anthropic/claude-haiku-4-5", [
    {
      role: "system",
      content:
        "Research notes:\nA fact.\n\nDraft:\nThe draft.",
      cachedPrefix: "Research notes:\nA fact.",
    },
    { role: "user", content: "check" },
  ]);
  assertEquals(cached[0].content, [
    {
      type: "text",
      text: "Research notes:\nA fact.",
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: "Draft:\nThe draft." },
  ]);
  assertEquals(
    cacheSystemMessages("google/gemini-3.1-flash-lite", [
      { role: "system", content: "notes" },
    ])[0].content,
    "notes",
  );
});

Deno.test("reasoning effort is sent only for documented values the catalog lists", () => {
  assertEquals(reasoningEffortField(["reasoning_effort"], "low"), {
    reasoning_effort: "low",
  });
  assertEquals(reasoningEffortField(["reasoning_effort"], "none"), {});
  assertEquals(reasoningEffortField(["temperature"], "low"), {});
});

Deno.test("usage parser reads reasoning tokens from the final chunk", () => {
  assertEquals(
    usageFromPayload({
      usage: {
        prompt_tokens: 10,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 4 },
        completion_tokens_details: { reasoning_tokens: 30 },
      },
    }),
    {
      promptTokens: 10,
      cachedTokens: 4,
      completionTokens: 40,
      reasoningTokens: 30,
    },
  );
});

Deno.test("estimate uses catalog prices and does not add reasoning twice", () => {
  const meter = new RunMeter();
  meter.add("google/gemini-3.5-flash", {
    promptTokens: 19531,
    cachedTokens: 0,
    completionTokens: 53581,
    reasoningTokens: 50992,
  });
  const prices = new Map([[
    "google/gemini-3.5-flash",
    { inputPerToken: 1.5e-6, outputPerToken: 9e-6 },
  ]]);
  const estimate = estimateUsd(meter, prices);
  assertEquals(estimate.complete, true);
  assertEquals(Number(estimate.usd.toFixed(3)), 0.512);
});

Deno.test("fact-check cites a note URL and flags an unsupported claim", () => {
  const hits = [{
    title: "Pet survey",
    url: "https://example.com/cats",
    content: "Domestic cats in the United States number about 86.4 million.",
  }];
  const claim = "Domestic cats in the United States number about 86.4 million.";
  const other = "The author keeps a white cat as a member of the household.";
  const text = `${claim} ${other}`;
  const checkPrompt = factcheckUserPrompt([claim]);
  assertStringIncludes(checkPrompt, "checkable specifics");
  assertStringIncludes(checkPrompt, "not-a-claim");
  assertStringIncludes(
    checkPrompt,
    "Mark argument, interpretation, examples, transitions, and widely known general knowledge as not-a-claim",
  );
  assertEquals(splitClaims(text).length, 2);
  const checked = applyFactCheck(
    text,
    verdictsFromContent(JSON.stringify({
      claims: [
        { text: claim, status: "supported", url: "https://example.com/cats" },
        { text: other, status: "supported", url: "https://evil.example/fake" },
      ],
    })),
    hits,
  );
  assertFalse(
    checked.text.split("## Sources")[0].includes("https://example.com/cats"),
  );
  assertStringIncludes(checked.text, "[Pet survey](https://example.com/cats)");
  assertFalse(checked.text.includes("[unsupported]"));
  assertEquals(checked.unsupportedClaims, [other]);
  assertStringIncludes(checked.text, "## Sources");
  assertEquals(splitClaims(checked.text).length, 2);
  assertFalse(checked.text.includes("evil.example"));
  const twice = applyFactCheck(
    `${claim} ${claim}`,
    [
      { text: claim, status: "supported", url: "https://example.com/cats" },
      { text: claim, status: "supported", url: "https://example.com/cats" },
    ],
    hits,
  );
  assertEquals(
    twice.text.split("## Sources")[0].split("https://example.com/cats").length,
    1,
  );
  const dollar = "Costs rose by $& and $' last year in the survey.";
  const awkward = "https://example.com/cats)";
  const escaped = applyFactCheck(
    dollar,
    [{ text: dollar, status: "supported", url: awkward }],
    [{ title: "Survey [2024]", url: awkward, content: "" }],
  );
  assertEquals(escaped.text.split(dollar).length, 2);
  assertStringIncludes(
    escaped.text,
    markdownLink("Survey [2024]", "https://example.com/cats)"),
  );
  assertEquals(
    checkModelId("google/gemini-3.1-flash-lite", "openai/gpt-4.1"),
    "openai/gpt-4.1",
  );
  assertEquals(
    checkModelId("openai/gpt-4.1", "openai/gpt-4.1"),
    "openai/gpt-4.1",
  );
  assertEquals(
    checkModelId(
      "google/gemini-3.1-flash-lite",
      "google/gemini-3.1-flash-lite",
    ),
    "google/gemini-3.1-flash-lite",
  );
  assertEquals(
    checkerReplacement(
      "anthropic/claude-haiku-4-5",
      "google/gemini-3.1-flash-lite",
    ),
    "checker anthropic/claude-haiku-4-5 matches a drafter; using google/gemini-3.1-flash-lite",
  );
  assertEquals(
    checkerReplacement("not-a-model", "openai/gpt-4.1", "CHECK_MODEL"),
    "CHECK_MODEL not-a-model is not a HaiMaker model; using openai/gpt-4.1",
  );
  assertEquals(
    checkerReplacement("openai/gpt-4.1", "openai/gpt-4.1"),
    undefined,
  );
  assertEquals(
    citableHits([{
      ...hits[0],
      content:
        "School-going students can use these essays for their essay writing competitions and speech contests today.",
    }]).length,
    0,
  );
  assertStringIncludes(factcheckRecord(checked), other);
});

Deno.test("fact-check skips a not-a-claim verdict", () => {
  const hits = [{
    title: "Pet survey",
    url: "https://example.com/cats",
    content: "Domestic cats in the United States number about 86.4 million.",
  }];
  const claim = "Domestic cats in the United States number about 86.4 million.";
  const argument =
    "That presence is why a household often organizes itself around the cat.";
  const parsed = verdictsFromContent(JSON.stringify({
    claims: [
      { text: claim, status: "supported", url: "https://example.com/cats" },
      { text: argument, status: "not-a-claim", url: "" },
    ],
  }));
  assertEquals(parsed[1]?.status, "not-a-claim");
  const checked = applyFactCheck(
    `${claim} ${argument}`,
    parsed,
    hits,
  );
  assertEquals(checked.supported, 1);
  assertEquals(checked.unsupportedClaims, []);
  assertEquals(checked.uncheckedClaims, []);
  assertStringIncludes(checked.text, "[Pet survey](https://example.com/cats)");
  assertFalse(factcheckRecord(checked).includes(argument));
});

Deno.test("unchecked fact-check is recorded in the notes and keeps the essay", async () => {
  const essay = "Domestic cats in the United States number about 86.4 million.";
  const skipped = await checkClaims(essay, [{
    title: "Pet survey",
    url: "https://example.com/cats",
    content: essay,
  }], {
    name: "HaiMaker",
    provider: "haimaker",
    modelId: "openai/gpt-4.1",
    baseUrl: "https://api.haimaker.ai/v1",
    apiKey: undefined,
  }, "notes");
  assertEquals(skipped.checked, false);
  assertEquals(skipped.detail, "no HaiMaker key; not checked");
  assertEquals(skipped.text, essay);
  const failed = uncheckedResult(essay, "HTTP 401", "openai/gpt-4.1");
  const record = factcheckRecord(failed);
  assertStringIncludes(record, "Checker: openai/gpt-4.1");
  assertStringIncludes(record, "HTTP 401");
  assertStringIncludes(record, essay);
  assertFalse(record.includes("[unsupported]"));
  const notes = notesRecord({
    notes: "A cat fact.",
    outlineModel: "mercury-2.5",
    draftModels: ["mercury-2.5"],
    synthesisModel: "mercury-2.5",
    cost: "estimate $0.010",
    factcheck: record,
  });
  assertStringIncludes(notes, "HTTP 401");
  assertStringIncludes(notes, "Unchecked:");
  assertStringIncludes(notes, "A cat fact.");
  assertFalse(notes.includes("[unsupported]"));
});

Deno.test("extend stops after three rejects or six calls", () => {
  assertEquals(extendShouldStop(0, 2), false);
  assertEquals(extendShouldStop(1, 3), true);
  assertEquals(extendShouldStop(6, 0), true);
  assertEquals(extendShouldContinue(100, 900, 0, 0, 0), false);
  assertEquals(extendShouldContinue(900, 900, 2, 0, 0), false);
  assertEquals(extendShouldContinue(100, 900, 2, 0, 0), true);
});

const PET_CAT_PARAGRAPH =
  "show how cats act as pets. School-going students can use these essays for their essay writing competitions. Students can also use them for speech giving contests. Additionally, students can use them in other similar competitions. Individuals can select any of these essays according to their specific needs. The author of the text keeps a pet cat and enjoys being around her. The author loves this adorable pet cat. If you have ever kept a cat as a pet, you will know that cats are very peculiar animals. The author describes their own pet cat as a white-coloured, soft, and furry animal. The author simply loves this pet cat and enjoys her presence.";

const PET_CAT_REPEAT =
  "The source provides short and long essays about a pet cat in the English language. These essays show how cats act as pets. School-going students can use these essays for their essay writing competitions. Students can also use them for speech giving contests. Additionally, students can use them in other similar competitions. Individuals can select any of these essays according to their specific needs. The author of the text keeps a pet cat and enjoys being around her. The author loves this adorable pet cat. The first essay contains two hundred words. The second essay contains three hundred words.";

const PET_CAT_SCRATCH = `Let's count the words of this version:
1. The (1)
2. provided (2)
3.

wait, hyphenated word. Let's count as two words to be safe, or one.`;

Deno.test("expansion rejects pet-cat scratch and a lowercase fragment", () => {
  assertEquals(isProseExpansion(PET_CAT_SCRATCH), false);
  assertEquals(isProseExpansion(PET_CAT_PARAGRAPH), false);
  assertEquals(
    acceptExpansion(
      "notes about cats " + PET_CAT_PARAGRAPH,
      PET_CAT_SCRATCH,
      80,
    ),
    false,
  );
  assertEquals(
    isProseExpansion("Cats are peculiar animals with complex behavior."),
    true,
  );
  assertEquals(isProseExpansion("86.4 million cats live in the USA."), true);
  assertEquals(isProseExpansion("eBay lists used cat carriers."), false);
});

Deno.test("repeat check uses shared-word ratio against each paragraph", () => {
  assertEquals(repeatsDraft(PET_CAT_PARAGRAPH, PET_CAT_REPEAT), true);
  assertEquals(
    repeatsDraft(
      "HaiMaker failed with HTTP 524 because Cloudflare closed the origin.",
      PET_CAT_REPEAT,
    ),
    false,
  );
});

Deno.test("extend notes drop page descriptions and source lines", () => {
  const mill =
    "School-going students can use these essays for competitions. The first essay contains 200 words and the second contains 300 words for a speech contest that fills the paragraph.";
  const product =
    "Source: HaiMaker\nURL: https://example.com/haimaker\nHaiMaker previously failed with HTTP 524, a Cloudflare origin timeout. The auto-router sent writing prompts to step-3.7-flash.";
  assertEquals(describesSourcePage(mill), true);
  assertEquals(
    describesSourcePage(
      "A successful admissions essay reflects the student's unique voice and perspective across a full paragraph of advice.",
    ),
    true,
  );
  const kept = factualNotes(`${mill}\n\n${product}`);
  assertEquals(kept.length, 1);
  assertFalse(kept[0].includes("Source:"));
  assertFalse(kept[0].includes("URL:"));
  assertStringIncludes(kept[0], "HTTP 524");
  const facts = writerFacts(`${mill}\n\n${product}`);
  assertFalse(facts.includes("Source:"));
  assertFalse(facts.includes("\n\n"));
  assertStringIncludes(facts, "HTTP 524");
  const drafted = draftingNotes(`essay on my pet cat\n\n${mill}\n\n${product}`);
  assertFalse(drafted.includes("students can use"));
  assertStringIncludes(drafted, "Source: HaiMaker");
  assertStringIncludes(drafted, "URL: https://example.com/haimaker");
});

Deno.test("essay markdown has one title and no style line", () => {
  const body = "# Essay on My Pet Cat\n\nCats are peculiar animals.";
  assertEquals(stripLeadingTitle(body), "Cats are peculiar animals.");
  const essay = essayMarkdown("Essay on My Pet Cat", body);
  assertFalse(essay.includes("## Style:"));
  assertEquals(
    essay.startsWith("# Essay on My Pet Cat\n\n4 words\n\nCats"),
    true,
  );
  const sourced = essayMarkdown(
    "Title",
    "One two three.\n\n## Sources\n\n- [A long listed source title](https://a.example/path)",
  );
  assertStringIncludes(sourced, "3 words");
  assertEquals(bodyWordCount(sourced), 3);
  assertStringIncludes(sourced, "## Sources");
  assertStringIncludes(sourced, "https://a.example/path");
  assertEquals(
    publishedTitle(
      "elites and politics",
      "elites and politics",
      "Political elites set the agenda for modern government. Parties decide.",
    ),
    "Political elites set the agenda for modern government",
  );
  const dumped = finishEssay(
    "The Role of Elites",
    [
      "The Role of Elites",
      "Elites hold office and set policy in the capital.",
      "Elites hold office and set policy in the capital city.",
      "The working group is studying that question this year.",
      "The sentence stops at gender and.",
    ].join("\n\n"),
  );
  assertFalse(dumped.includes("The Role of Elites"));
  assertFalse(dumped.includes("working group"));
  assertFalse(dumped.includes("gender and"));
  assertStringIncludes(
    dumped,
    "Elites hold office and set policy in the capital.",
  );
  const keep =
    "Cats live with people in apartments and on farms across many climates. "
      .repeat(40);
  const junk =
    "The working group is studying that question this year for a paper. "
      .repeat(40);
  const original = `${keep}\n\n${junk}`;
  const dropped = finishEssay("Cats", original);
  assertEquals(countDraftWords(dropped) < countDraftWords(original), true);
  const held = finishEssay("Cats", original, countDraftWords(original));
  assertStringIncludes(held, "working group");
  assertEquals(countDraftWords(held), countDraftWords(original));
  const notes = notesRecord({
    notes: "A cat fact.",
    outlineModel: "google/gemini-3.1-flash-lite",
    draftModels: ["google/gemini-3.1-flash-lite"],
    synthesisModel: "google/gemini-3.1-flash-lite",
    cost: "estimate $0.010",
  });
  assertStringIncludes(
    notes,
    "Model: outline google/gemini-3.1-flash-lite; drafts google/gemini-3.1-flash-lite; synthesis google/gemini-3.1-flash-lite",
  );
  assertStringIncludes(notes, "Cost: estimate $0.010");
  assertStringIncludes(notes, "A cat fact.");
});

Deno.test("body cleanup keeps ordinary sentences and Sources links", () => {
  assertFalse(isCallToAction(
    "Their care requirements are modest compared with a dog's.",
  ));
  assertFalse(isCallToAction(
    "If any of the old traditions were right, the frog was never just a pet.",
  ));
  assertFalse(isCallToAction(
    "Historians check out the parish records before the parish is rebuilt.",
  ));
  assertEquals(isCallToAction("Click here for the care sheet."), true);
  assertEquals(isCallToAction("Shop now before the stock is gone."), true);
  const ordinary =
    "Their care requirements are modest compared with a dog's. If any of the old traditions were right, the frog was never just a pet. Historians check out the parish records before the parish is rebuilt.";
  const shop =
    "If any of the frogs on this list look interesting to you, you can check out their full care requirements at: The The-Dyed Iguana's exotic pet care sheets (https://www.the-dyed-iguana.com/). Click here to buy now.";
  const body = `${ordinary} ${shop}\n\n## Sources\n\n- [Notes](https://example.com/notes)`;
  const stripped = stripBodyLinks(ordinary + " See https://evil.example/x.");
  assertFalse(stripped.includes("http"));
  assertStringIncludes(stripped, "See");
  const dropped = dropCallsToAction(body.split("## Sources")[0]);
  assertStringIncludes(dropped, "care requirements are modest");
  assertStringIncludes(dropped, "If any of the old traditions");
  assertStringIncludes(dropped, "Historians check out");
  assertStringIncludes(dropped, "check out their full care requirements");
  assertFalse(dropped.includes("the-dyed-iguana.com"));
  assertFalse(dropped.includes("Click here"));
  const saved = essayMarkdown("Frogs", body);
  assertStringIncludes(saved, "care requirements are modest");
  assertStringIncludes(saved, "Historians check out");
  assertFalse(saved.split("## Sources")[0].includes("http"));
  assertFalse(saved.split("## Sources")[0].includes("Click here"));
  assertStringIncludes(saved, "## Sources");
  assertStringIncludes(saved, "https://example.com/notes");
  assertEquals(
    cleanEssayBody(body).includes("https://example.com/notes"),
    true,
  );
});

Deno.test("cleanup is checked before save, and a leftover link forces revision", () => {
  const filler = "word ".repeat(82).trim() + ".";
  const raw = `${filler} Click here to buy now.`;
  assertEquals(countDraftWords(raw) >= 85, true);
  const markdown = essayMarkdown("Title", raw);
  assertFalse(markdown.includes("Click here"));
  assertThrows(() => assertEssayLength(markdown, 100));
  assertThrows(() => essayReadyToSave("Title", raw, 100));
  const kept = essayReadyToSave("Title", filler, 90);
  assertStringIncludes(kept, "word");
  assertEquals(
    briefMustRevise(
      { pass: true, misses: [] },
      "A frog still waits. See the sheets (https://www.the-dyed-iguana.com/).",
    ),
    true,
  );
  assertEquals(
    briefMustRevise({ pass: true, misses: [] }, "A frog still waits."),
    false,
  );
});

Deno.test("fact-check returns claim numbers in sized batches", () => {
  const claims = Array.from(
    { length: 60 },
    (_, index) => `Claim ${index + 1} is long enough to be checked against the notes.`,
  );
  assertEquals(claimBatches(claims).map((batch) => batch.length), [25, 25, 10]);
  assertEquals(factcheckTokenCap(1) < factcheckTokenCap(25), true);
  assertEquals(factcheckTokenCap(25) < 4096, true);
  const prompt = factcheckUserPrompt(claims.slice(25, 50), 26);
  assertStringIncludes(prompt, "{i, status, url}");
  assertStringIncludes(prompt, "Do not repeat the claim text");
  assertStringIncludes(prompt, "26. Claim 26");
  assertFalse(prompt.includes("{text, status, url}"));
  const claim = "Domestic cats in the United States number about 86.4 million.";
  const other = "The author keeps a white cat as a member of the household.";
  const parsed = verdictsFromContent(JSON.stringify({
    claims: [
      { i: 1, status: "supported", url: "https://example.com/cats" },
      { i: 2, status: "unsupported", url: "" },
    ],
  }), [claim, other]);
  assertEquals(parsed[0]?.text, claim);
  assertEquals(parsed[1]?.text, other);
  assertEquals(parsed[1]?.status, "unsupported");
});

Deno.test("length is measured, not guessed, and capped at 115 percent", () => {
  assertEquals(essayLengthCeiling(1200), 1380);
  const opening = "Opening paragraph stays at the start of the essay.";
  const close = "This closing paragraph must survive the trim in full.";
  const body =
    "The frog waits on the bank and watches the rain fall on the pond. ".repeat(30);
  const capped = capEssayLength(
    `${opening}\n\n${body}\n\n${close}\n\n## Sources\n\n- [Notes](https://example.com/notes)`,
    200,
  );
  const prose = capped.split("## Sources")[0].trim();
  const parts = prose.split(/\n\n+/);
  assertEquals(parts[0], opening);
  assertEquals(parts.at(-1), close);
  assertEquals(countDraftWords(prose) <= essayLengthCeiling(200), true);
  assertEquals(countDraftWords(prose) >= essayLengthFloor(200), true);
  assertStringIncludes(capped, "https://example.com/notes");
  const guessed =
    "The essay is significantly under the 1200-word constraint, totaling approximately 950 words.";
  assertEquals(isLengthMiss(guessed), true);
  assertEquals(
    briefMustRevise({ pass: false, misses: [guessed] }, "A frog still waits in the tank tonight."),
    false,
  );
  assertStringIncludes(
    briefRevisionUserPrompt(FROG_BRIEF, "A frog still waits in the tank tonight.", ["too solemn"], 1200),
    "Repetition is a fault",
  );
  assertStringIncludes(
    briefRevisionUserPrompt(FROG_BRIEF, "A frog still waits in the tank tonight.", ["too solemn"], 1200),
    "between 1020 and 1380 words",
  );
});

Deno.test("checker may match the writer and must differ from a drafter", () => {
  assertEquals(
    checkModelId("openai/gpt-4.1", "google/gemini-3.1-flash-lite"),
    "google/gemini-3.1-flash-lite",
  );
  assertEquals(
    checkModelId(
      "google/gemini-3.1-flash-lite",
      "anthropic/claude-haiku-4-5",
    ),
    "google/gemini-3.1-flash-lite",
  );
  assertEquals(
    checkModelId("mistralai/mistral-large-2512", "moonshotai/kimi-k2-0905"),
    "google/gemini-3.1-flash-lite",
  );
  assertFalse(
    checkModelId("google/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite")
      === "deepseek/deepseek-v4-flash",
  );
});

Deno.test("picker label uses catalog price and does not claim default reasoning", () => {
  const catalog = catalogFromHub([{
    model_group: "google/gemini-3.5-flash",
    supports_reasoning: true,
    supported_openai_params: ["reasoning_effort"],
    output_cost_per_token: 9e-6,
    input_cost_per_token: 1.5e-6,
    mode: "chat",
  }, {
    model_group: "openai/gpt-4.1",
    supports_reasoning: false,
    output_cost_per_token: 8e-6,
    input_cost_per_token: 2e-6,
    mode: "chat",
  }]);
  assertEquals(
    pickerLabel("Gemini 3.5 Flash", catalog.get("google/gemini-3.5-flash")),
    "Gemini 3.5 Flash · can reason · $9/M out",
  );
  const curated = [
    { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "openai/gpt-4.1", label: "GPT-4.1" },
  ];
  const choices = pickerModels(curated, catalog, new Set(["openai/gpt-4.1"]));
  assertEquals(choices.map((choice) => choice.id), ["openai/gpt-4.1"]);
  assertEquals(
    pickerModels(curated, catalog, new Set(["google/*"])).map((choice) =>
      choice.id
    ),
    [],
  );
  assertEquals(keyListWarning(curated, new Set(["google/*"])).length > 0, true);
  assertEquals(keyListWarning(curated, undefined), "");
  assertEquals(OUTLINE_MAX_TOKENS, 4096);
  assertEquals(SYNTHESIS_MAX_TOKENS, 65536);
  assertEquals(synthesisTokens(900, true), 65536);
  assertEquals(synthesisTokens(5000, true), 65536);
  assertEquals(synthesisTokens(900, false), 4096);
  assertEquals(synthesisTokens(5000, false), 8192);
});
