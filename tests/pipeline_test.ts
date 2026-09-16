/// <reference lib="deno.ns" />
import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.19";
import {
  acceptExpansion,
  countWords as countDraftWords,
  type Draft,
  draftUserPrompt,
  expansionTokenBudget,
  extendShouldStop,
  extendToTarget,
  factualNotes,
  fitExtension,
  groundedInNote,
  mergeExtension,
  OUTLINE_MAX_TOKENS,
  outlineUserPrompt,
  pickDraft,
  repeatsDraft,
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
  completionRequestBody,
  estimateUsd,
  RunMeter,
  usageFromPayload,
} from "../src/complete.ts";
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
  assertStringIncludes(prompt, notes);
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
    "The pipeline is five model calls.",
  );
  assertStringIncludes(prompt, "only facts you may use");
  assertStringIncludes(prompt, "Cover the product facts");
  assertStringIncludes(prompt, "Say each fact once");
  assertStringIncludes(prompt, "Do not add a closing paragraph.");
  assertStringIncludes(prompt, "The pipeline is five model calls.");
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

Deno.test("extend stops after three rejects or six calls", () => {
  assertEquals(extendShouldStop(0, 2), false);
  assertEquals(extendShouldStop(1, 3), true);
  assertEquals(extendShouldStop(6, 0), true);
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
