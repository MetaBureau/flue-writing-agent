/// <reference lib="deno.ns" />
import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.19";
import {
  acceptExpansion,
  countWords as countDraftWords,
  describesSourcePage,
  type Draft,
  draftingNotes,
  draftUserPrompt,
  essayMarkdown,
  expansionTokenBudget,
  extendShouldContinue,
  extendShouldStop,
  extendToTarget,
  factualNotes,
  fitExtension,
  groundedInNote,
  isProseExpansion,
  mergeExtension,
  notesRecord,
  OUTLINE_MAX_TOKENS,
  outlineUserPrompt,
  pickDraft,
  repeatsDraft,
  stageSystem,
  stripLeadingTitle,
  wordCountFromTopic,
  wordsToAsk,
} from "../src/agents/write.ts";
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
  checkModelId,
  checkerReplacement,
  citableHits,
  factcheckRecord,
  markdownLink,
  splitClaims,
  uncheckedResult,
  verdictsFromContent,
} from "../src/factcheck.ts";
import {
  keepIfNotShortened,
  styleUserPrompt,
} from "../src/skills/editorial.ts";
import { countWords, topicSlug } from "../src/main.ts";
import {
  claimText,
  hitsFromPayload,
  relevantToQuery,
  searchQuery,
  sourceNotes,
} from "../src/research.ts";

Deno.test("pickDraft selects analytical draft for economist style", () => {
  const drafts: Draft[] = [
    { style: "conversational", content: "conversational body" },
    { style: "professional", content: "professional body" },
    { style: "analytical", content: "analytical body" },
  ];
  const selected = pickDraft(drafts, "economist");
  assertEquals(selected.content, "analytical body");
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
  const prompt = outlineUserPrompt(notes);
  assertStringIncludes(stageSystem(notes, "instruction"), notes);
  assertFalse(prompt.includes(notes));
  assertStringIncludes(prompt, "900-word");
  assertStringIncludes(prompt, "Do not add introduction");
  assertStringIncludes(prompt, "Four sections at most");
  assertFalse(prompt.includes("OpenCall"));
  assertFalse(prompt.includes("thoughtful"));
});

Deno.test("draft prompt stays in the notes and sets a floor", () => {
  const prompt = draftUserPrompt(
    "Write in an analytical, data-focused tone",
    {
      title: "Flue",
      sections: ["Five calls"],
      wordCountTarget: 900,
    },
  );
  assertStringIncludes(prompt, "only facts from the notes");
  assertStringIncludes(prompt, "Cover the product facts");
  assertStringIncludes(prompt, "Say each fact once");
  assertStringIncludes(prompt, "Do not add a closing paragraph.");
  assertStringIncludes(
    stageSystem("The pipeline is five model calls.", "instruction"),
    "The pipeline is five model calls.",
  );
  assertFalse(prompt.includes("The pipeline is five model calls."));
  assertFalse(prompt.includes("at least 900"));
});

Deno.test("style prompt cuts praise and does not pad", () => {
  const prompt = styleUserPrompt("The pipeline is five model calls.", 900);
  assertStringIncludes(prompt, "Do not add facts");
  assertStringIncludes(prompt, "Cut praise");
  assertStringIncludes(prompt, "Drop ads");
  assertStringIncludes(prompt, "Do not pad it toward 900");
});

Deno.test("word count defaults to 900 unless the topic names a count", () => {
  assertEquals(wordCountFromTopic("The Flue agent is a Deno CLI."), 900);
  assertEquals(wordCountFromTopic("Write 200 words about Flue."), 200);
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
      content: "Notes, the only facts you may use:\nA fact.\n\nDraft:\nThe draft.",
      cachedPrefix: "Notes, the only facts you may use:\nA fact.",
    },
    { role: "user", content: "check" },
  ]);
  assertEquals(cached[0].content, [
    {
      type: "text",
      text: "Notes, the only facts you may use:\nA fact.",
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
  assertStringIncludes(checked.text, "[Pet survey](https://example.com/cats)");
  assertFalse(checked.text.includes("[unsupported]"));
  assertEquals(checked.unsupportedClaims, [other]);
  assertStringIncludes(checked.text, "## Sources");
  assertFalse(checked.text.includes("evil.example"));
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
    "google/gemini-3.1-flash-lite",
  );
  assertEquals(
    checkModelId("google/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite"),
    "openai/gpt-4.1",
  );
  assertEquals(
    checkerReplacement("openai/gpt-4.1", "google/gemini-3.1-flash-lite"),
    "checker openai/gpt-4.1 matches the writer; using google/gemini-3.1-flash-lite",
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
    draftModel: "mercury-2.5",
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
  const kept = factualNotes(`${mill}\n\n${product}`);
  assertEquals(kept.length, 1);
  assertFalse(kept[0].includes("Source:"));
  assertFalse(kept[0].includes("URL:"));
  assertStringIncludes(kept[0], "HTTP 524");
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
  assertEquals(essay.startsWith("# Essay on My Pet Cat\n\nCats"), true);
  const notes = notesRecord({
    notes: "A cat fact.",
    outlineModel: "google/gemini-3.1-flash-lite",
    draftModel: "google/gemini-3.1-flash-lite",
    cost: "estimate $0.010",
  });
  assertStringIncludes(notes, "Model: google/gemini-3.1-flash-lite");
  assertStringIncludes(notes, "Cost: estimate $0.010");
  assertStringIncludes(notes, "A cat fact.");
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
});
