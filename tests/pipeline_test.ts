/// <reference lib="deno.ns" />
import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@^1.0.19";
import {
  assertEssayLength,
  bodyWordCount,
  cachedPrefix,
  cleanEssayBody,
  DRAFT_SYSTEM,
  draftUserPrompt,
  dropCallsToAction,
  essayMarkdown,
  essayReadyToSave,
  expandUserPrompt,
  formatPlan,
  sectionLimit,
  shortenUserPrompt,
  isCallToAction,
  notesRecord,
  notesUserPrompt,
  planFromContent,
  planUserPrompt,
  publishedTitle,
  stageSystem,
  stripBodyLinks,
  stripLeadingTitle,
  systemMessage,
  wordCountFromTopic,
} from "../src/agents/write.ts";
import {
  briefFromContent,
  counterQuery,
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
  citationProblems,
  copyProblems,
  groundingProblems,
  quoteCopiedPhrases,
  quoteProblems,
  quoteShare,
  withSources,
} from "../src/cite.ts";
import {
  cacheSystemMessages,
  completionRequestBody,
  estimateUsd,
  responseFormatField,
  RunMeter,
  usageFromPayload,
} from "../src/complete.ts";
import {
  criticFromContent,
  criticUserPrompt,
  issuesFromHarness,
  mergeIssues,
  reviseUserPrompt,
} from "../src/critic.ts";
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
  planPiece,
  WRITE_STAGES,
} from "../src/contract.ts";
import { countWords, topicSlug } from "../src/main.ts";
import {
  articlesFromExtract,
  articlesFromHits,
  canonicalUrl,
  failedExtractUrls,
  claimText,
  EXTRACT_LIMIT,
  formatAttributedNotes,
  hitsFromPayload,
  isBlockedSource,
  mergeHits,
  outletMatchesDomain,
  relevantToQuery,
  researchBudget,
  searchQuery,
  sourceNotes,
  sourceNotesFromUnknown,
  titleKey,
} from "../src/research.ts";
import { isProviderModel, WRITER_OPTIONS } from "../src/providers.ts";
import {
  acceptPromptTurn,
  essayPrompt,
  fallbackQuestion,
  parsePromptTurn,
  PROMPT_MAX_TURNS,
  PROMPT_SYSTEM,
  promptUserMessage,
} from "../src/prompt.ts";
import { styleSystemPrompt, styles } from "../src/skills/styles.ts";

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

const LOWY: ReturnType<typeof sourceNotesFromUnknown>[0] = {
  id: "n1",
  url: "https://www.lowyinstitute.org/elites",
  title: "Political elites",
  author: "Michael Fullilove",
  outlet: "Lowy Institute",
  date: "2018-03-01",
  stance: "Elites still set the agenda in Australian politics.",
  claims: [{
    claim: "A 2006 survey found most Australians saw a ruling class.",
    quote: "Most Australians believed a small elite ran the country.",
  }],
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
});

Deno.test("piece files follow notes, plan, draft, critic, essay", () => {
  const slug = topicSlug("Write a 900 word essay about pet cats");
  assertEquals(essayPiece(slug, "# Title\n").filename, `${slug}.md`);
  assertEquals(notesPiece(slug, "notes\n").filename, `${slug}.notes.md`);
  assertEquals(planPiece(slug, "plan\n").filename, `${slug}.plan.md`);
  const draft = draftPiece(slug, "Cats sleep.");
  assertEquals(draft.id, "draft");
  assertEquals(draft.filename, `${slug}.draft.md`);
  assertEquals(
    WRITE_STAGES.map((stage) => stage.id),
    ["brief", "research", "plan", "draft", "critic"],
  );
  assertEquals(pieceRank("notes"), 0);
  assertEquals(pieceRank("plan"), 1);
  assertEquals(pieceRank("draft"), 2);
  assertEquals(pieceRank("critic"), 3);
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

Deno.test("word count defaults to 900 unless the topic names a count", () => {
  assertEquals(wordCountFromTopic("The Flue agent is a Deno CLI."), 900);
  assertEquals(wordCountFromTopic("Write 200 words about Flue."), 200);
});

Deno.test("essay length floor is 85 percent of the request", () => {
  assertEquals(essayLengthFloor(900), 765);
  assertEquals(essayLengthCeiling(1200), 1380);
  assertEquals(
    bodyWordCount(
      "# Title\n\n3 words\n\nOne two three.\n\n## Sources\n\n- [A long listed source title](https://a.example/path)",
    ),
    3,
  );
});

Deno.test("research query includes the claim and a counter search", () => {
  const query = researchQuery(FROG_BRIEF);
  assertStringIncludes(query, "pet frogs");
  assertStringIncludes(query, "magical");
  assertFalse(query === "pet frogs");
  assertStringIncludes(counterQuery(FROG_BRIEF), "criticism");
});

Deno.test("brief parse falls back when there is no key", async () => {
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
  assertEquals(
    briefFromContent(JSON.stringify({
      subject: "frogs",
      claim: "magic",
      audience: "kids",
      purpose: "amuse",
      tone: "light",
      constraints: [],
    }), "topic"),
    {
      text: "topic",
      subject: "frogs",
      claim: "magic",
      audience: "kids",
      purpose: "amuse",
      tone: "light",
      constraints: [],
    },
  );
});

Deno.test("stage prompts carry the frog brief and attributed notes", () => {
  const plan = planFromContent(
    JSON.stringify({
      title: "Pet frogs",
      sections: [{ heading: "Opening", purpose: "Claim", noteIds: ["n1"] }],
      counters: ["Sceptics call it metaphor"],
      gaps: ["no veterinary trial"],
    }),
    1200,
    "frogs",
  );
  const prompts = [
    planUserPrompt(FROG_BRIEF, 1200),
    draftUserPrompt(plan, FROG_BRIEF, styles.economist),
    expandUserPrompt(FROG_BRIEF, plan, "A frog waits on the pond."),
    shortenUserPrompt(FROG_BRIEF, plan, "A frog waits on the pond."),
    criticUserPrompt(FROG_BRIEF, "A frog waits on the pond. [n1]"),
    reviseUserPrompt(FROG_BRIEF, "A frog waits on the pond.", [{
      passage: "A frog waits",
      problem: "Too solemn",
      fix: "Make it funnier",
    }]),
  ];
  for (const prompt of prompts) assertBriefContract(prompt);
  assertStringIncludes(DRAFT_SYSTEM, "[n3]");
  assertStringIncludes(DRAFT_SYSTEM, "15%");
  assertStringIncludes(draftUserPrompt(plan, FROG_BRIEF), "[n1]");
  assertStringIncludes(
    draftUserPrompt({ ...plan, wordCountTarget: 500 }, FROG_BRIEF),
    "continuous prose",
  );
  assertStringIncludes(planUserPrompt(FROG_BRIEF, 500), "at most 3 sections");
  assertEquals(sectionLimit(500), 3);
  assertEquals(sectionLimit(2000), 5);
  assertStringIncludes(criticUserPrompt(FROG_BRIEF, "essay"), "15%");
  assertFalse(draftUserPrompt(plan, FROG_BRIEF).includes("Weave unused notes"));
  assertFalse(criticUserPrompt(FROG_BRIEF, "essay").includes("actual wit"));
  assertStringIncludes(
    styleSystemPrompt(styles.economist),
    "Cut empty praise and filler; keep humour, irony, and tone the brief asks for.",
  );
  const prefix = cachedPrefix(FROG_BRIEF, formatAttributedNotes([LOWY]));
  assertStringIncludes(prefix, FROG_BRIEF.text);
  assertStringIncludes(prefix, "Lowy Institute");
  assertStringIncludes(prefix, "URL: https://www.lowyinstitute.org/elites");
  assertStringIncludes(
    stageSystem(formatAttributedNotes([LOWY]), "instruction", FROG_BRIEF),
    "Michael Fullilove",
  );
});

Deno.test("outlet follows the URL domain, not a brand on the page", () => {
  assertEquals(
    outletMatchesDomain(
      "Lowy Institute",
      "https://www.lowyinstitute.org/elites",
    ),
    true,
  );
  assertEquals(
    outletMatchesDomain(
      "Sydney Morning Herald",
      "https://www.smh.com.au/politics",
    ),
    true,
  );
  assertEquals(
    outletMatchesDomain(
      "Critter Kingdom",
      "https://curacao-nature.com/pocket-frogs",
    ),
    false,
  );
  const notes = sourceNotesFromUnknown([{
    url: "https://curacao-nature.com/pocket-frogs",
    title: "Pocket frogs",
    outlet: "Critter Kingdom",
    claims: [],
  }]);
  assertEquals(notes[0]?.outlet, "Curacao Nature");
});

Deno.test("writers see attributed notes, not mixed anonymous sentences", () => {
  const independent = {
    ...LOWY,
    id: "n2",
    url: "https://independentaustralia.net/politics",
    title: "Another view",
    outlet: "Independent Australia",
    author: "",
    date: "2024-01-01",
    stance: "Donations buy access.",
    claims: [{
      claim: "Fairfax reported donation totals.",
      quote: "Donations reached millions.",
    }],
  };
  const notes = formatAttributedNotes([LOWY, independent]);
  assertStringIncludes(notes, "[n1]");
  assertStringIncludes(notes, "Lowy Institute");
  assertStringIncludes(notes, "Independent Australia");
  assertStringIncludes(notes, "Stance: Elites still set the agenda");
  const firstLowy = notes.indexOf("Most Australians believed");
  const firstIndependent = notes.indexOf("Donations reached millions");
  assertEquals(firstLowy < firstIndependent, true);
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

Deno.test("search payload ignores a synthesized answer and raw page body", () => {
  const hits = hitsFromPayload({
    answer: "This synthesized answer must not become a note.",
    results: [{
      title: "Docs",
      url: "https://docs.tavily.com/search",
      content:
        "Tavily search returns page text for agents. It is not a finished essay. The snippet includes the query and the sources so a writer can quote the page.",
      raw_content:
        "BuildrLabs offers a bootcamp in Colombo. This raw page must not become a note.",
      published_date: "2024-06-01",
    }],
  });
  assertEquals(hits.length, 1);
  assertFalse(hits[0].content.includes("synthesized answer"));
  assertFalse(hits[0].content.includes("bootcamp"));
  assertStringIncludes(hits[0].content, "page text");
  assertEquals(hits[0].publishedAt, "2024-06-01");
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

Deno.test("facebook posts, content farms, and title mirrors are dropped", () => {
  assertEquals(isBlockedSource("https://www.facebook.com/post/1"), true);
  assertEquals(isBlockedSource("https://frogdetails.com/best-pet-frogs"), true);
  assertEquals(isBlockedSource("https://mramphibian.com/popular"), true);
  assertEquals(isBlockedSource("https://lowyinstitute.org/article"), false);
  const merged = mergeHits([{
    title: "Labor donations",
    url: "https://www.example.com/story?utm_source=x",
    content: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
  }], [{
    title: "Labor donations",
    url: "https://anu-reporter.dev/labor-donations",
    content: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
  }]);
  assertEquals(merged.length, 1);
  assertEquals(canonicalUrl("http://www.Example.com/story/"), "https://example.com/story");
  assertEquals(titleKey("Labor Donations!"), "labor donations");
});

Deno.test("extract payload keeps full article text", () => {
  const body = "A".repeat(500);
  const articles = articlesFromExtract([{
    title: "Lowy",
    url: "https://www.lowyinstitute.org/elites",
    content: "snippet only",
    publishedAt: "2018-03-01",
  }], {
    results: [{
      url: "https://www.lowyinstitute.org/elites",
      raw_content: body,
    }],
  });
  assertEquals(articles.length, 1);
  assertEquals(articles[0].text, body);
  assertEquals(articles[0].publishedAt, "2018-03-01");
  assertEquals(EXTRACT_LIMIT, 8);
  assertEquals(
    notesUserPrompt(articles).includes("snippet only"),
    false,
  );
  assertStringIncludes(notesUserPrompt(articles), body.slice(0, 40));
  const snippet = articlesFromHits([{
    title: "Lowy",
    url: "https://www.lowyinstitute.org/elites",
    content:
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
    publishedAt: "2018-03-01",
  }]);
  assertEquals(snippet[0].text.includes("one two three"), true);
  assertEquals(
    failedExtractUrls({
      failed_results: [{ url: "https://www.lowyinstitute.org/elites" }],
    }),
    ["https://www.lowyinstitute.org/elites"],
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

Deno.test("research budget still grows with the requested length", () => {
  assertEquals(researchBudget(500).sources >= 8, true);
  assertEquals(researchBudget(5000).sources, 12);
});

Deno.test("completion body caps reasoning tokens and records usage", () => {
  const body = completionRequestBody("google/gemini-3.5-flash", [
    { role: "user", content: "notes" },
  ], {
    temperature: 0.2,
    label: "plan",
    maxTokens: 4096,
    reasoningEffort: "none",
  });
  assertEquals(body.max_completion_tokens, 4096);
  assertEquals("max_tokens" in body, false);
  assertEquals(body.stream_options, { include_usage: true });
  assertEquals("user" in body, false);
  assertEquals(
    responseFormatField(["response_format"], { type: "json_schema" }),
    { response_format: { type: "json_schema" } },
  );
  const cached = cacheSystemMessages("anthropic/claude-haiku-4-5", [
    {
      role: "system",
      content: "Research notes:\nA fact.\n\nDraft:\nThe draft.",
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

Deno.test("citation harness rejects a figure or quote without a note id", () => {
  const essay =
    `Most Australians believed a small elite ran the country in 2006. "Most Australians believed a small elite ran the country."`;
  const problems = citationProblems(essay, [LOWY]);
  assertEquals(problems.some((item) => item.includes("2006")), true);
  assertEquals(problems.some((item) => item.includes("quote")), true);
  const cited =
    `A 2006 Lowy survey found a ruling-class view [n1]. Fullilove wrote that "Most Australians believed a small elite ran the country." [n1]`;
  assertEquals(citationProblems(cited, [LOWY]), []);
  assertEquals(
    citationProblems("They cited [n9] a missing note.", [LOWY]).length > 0,
    true,
  );
  assertEquals(
    citationProblems("The 1999 debate still matters.", [LOWY]),
    [],
  );
});

Deno.test("copy harness requires quotation marks for a long shared phrase", () => {
  const article = {
    url: LOWY.url,
    title: LOWY.title,
    text:
      "Most Australians believed a small elite ran the country according to that survey of voters nationwide.",
    publishedAt: LOWY.date,
  };
  const copied =
    "Most Australians believed a small elite ran the country according to that survey of voters nationwide, which still shapes debate.";
  assertEquals(copyProblems(copied, [article]).length > 0, true);
  const quoted =
    `"Most Australians believed a small elite ran the country according to that survey of voters nationwide," Fullilove wrote [n1].`;
  assertEquals(copyProblems(quoted, [article]), []);
  const mixed =
    "Most Australians believed a small elite ran the country, which still shapes debate about parties, donations, and who actually governs. Voters hear that story every campaign. Access and party machines keep returning to the same argument in Canberra and in the states. None of that requires copying the survey sentence into every paragraph of the essay.";
  const wrapped = quoteCopiedPhrases(mixed, [article]);
  assertEquals(copyProblems(wrapped, [article]), []);
  assertStringIncludes(wrapped, '"');
  const filler = {
    url: LOWY.url,
    title: LOWY.title,
    text:
      "the a an and or of to in on for with from that this these those was were",
    publishedAt: LOWY.date,
  };
  assertEquals(
    copyProblems(
      "the a an and or of to in on for with from that this these those was were still.",
      [filler],
    ),
    [],
  );
});

Deno.test("quote budget flags a literature-review draft", () => {
  const quoted =
    `"do not require daily walks" and "fully aquatic amphibians that are perfect for small tanks" and "calm personality, attractive appearance, and easy care requirements" and "most frog owners enjoy these animals through observation rather than physical contact" and "are less tolerant of husbandry problems than reptiles" fill this short body.`;
  assertEquals(quoteShare(quoted) > 0.15, true);
  assertEquals(quoteProblems(quoted).length > 0, true);
  const paraphrased =
    `Frogs suit a small flat [n2]. Fire-bellied toads can share a five-gallon tank [n1]. White's tree frog is calm enough for a beginner [n2].`;
  assertEquals(quoteProblems(paraphrased), []);
});

Deno.test("sources list is built from cited note ids", () => {
  const essay = withSources("Elites still set the agenda [n1].", [LOWY]);
  assertStringIncludes(essay, "## Sources");
  assertStringIncludes(essay, "lowyinstitute.org");
  assertStringIncludes(essay, "[n1]");
});

Deno.test("critic JSON lists passage-level issues and the brief is the rulebook", () => {
  const review = criticFromContent(JSON.stringify({
    issues: [{
      passage: "A 2006 survey",
      problem: "The date is treated as current",
      fix: "Say the survey is from 2006",
    }],
  }));
  assertEquals(review.issues[0]?.problem, "The date is treated as current");
  const prompt = criticUserPrompt(FROG_BRIEF, "essay", [
    "figure 2006 has no citation",
  ]);
  assertStringIncludes(prompt, "figure 2006");
  assertFalse(prompt.includes("A pass needs actual wit"));
  const merged = mergeIssues(
    [{ passage: "a", problem: "x", fix: "y" }],
    issuesFromHarness(["x", "z"]),
  );
  assertEquals(merged.map((issue) => issue.problem), ["x", "z"]);
});

Deno.test("plan JSON maps sections to note ids and names gaps", () => {
  const plan = planFromContent(
    JSON.stringify({
      title: "Who runs Australia",
      sections: [{
        heading: "Donations",
        purpose: "Show money",
        noteIds: ["n2"],
      }],
      counters: ["Elites still matter"],
      gaps: ["lobbying", "media ownership"],
    }),
    900,
    "elites",
  );
  assertEquals(plan.title, "Who runs Australia");
  assertEquals(plan.sections[0].noteIds, ["n2"]);
  assertEquals(plan.gaps.includes("lobbying"), true);
  assertStringIncludes(formatPlan(plan), "[n2]");
  const fat = planFromContent(
    JSON.stringify({
      title: "Frogs",
      sections: [
        { heading: "Introduction: One", purpose: "", noteIds: ["n1"] },
        { heading: "Two", purpose: "", noteIds: ["n1"] },
        { heading: "Three", purpose: "", noteIds: ["n1"] },
        { heading: "Four", purpose: "", noteIds: ["n1"] },
        { heading: "Five", purpose: "", noteIds: ["n1"] },
        { heading: "Six", purpose: "", noteIds: ["n1"] },
        { heading: "Conclusion: Seven", purpose: "", noteIds: ["n1"] },
      ],
      counters: [],
      gaps: [],
    }),
    500,
    "frogs",
  );
  assertEquals(fat.sections.length, 3);
  assertEquals(fat.sections[0].heading, "One");
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
  assertEquals(
    publishedTitle(
      "elites and politics",
      "elites and politics",
      "Political elites set the agenda for modern government. Parties decide.",
    ),
    "Political elites set the agenda for modern government",
  );
  const notes = notesRecord({
    notes: "A cat fact.",
    writerModel: "anthropic/claude-sonnet-5",
    cost: "estimate $0.010",
  });
  assertStringIncludes(notes, "Model: anthropic/claude-sonnet-5");
  assertStringIncludes(notes, "A cat fact.");
});

Deno.test("body cleanup keeps ordinary sentences and Sources links", () => {
  assertFalse(isCallToAction(
    "Their care requirements are modest compared with a dog's.",
  ));
  assertEquals(isCallToAction("Click here for the care sheet."), true);
  const ordinary =
    "Their care requirements are modest compared with a dog's.";
  const shop = "Click here to buy now.";
  const body =
    `${ordinary} ${shop}\n\n## Sources\n\n- [Notes](https://example.com/notes)`;
  const stripped = stripBodyLinks(ordinary + " See https://evil.example/x.");
  assertFalse(stripped.includes("http"));
  const dropped = dropCallsToAction(body.split("## Sources")[0]);
  assertStringIncludes(dropped, "care requirements are modest");
  assertFalse(dropped.includes("Click here"));
  const saved = essayMarkdown("Frogs", body);
  assertFalse(saved.split("## Sources")[0].includes("Click here"));
  assertStringIncludes(saved, "https://example.com/notes");
  assertEquals(
    cleanEssayBody(body).includes("https://example.com/notes"),
    true,
  );
});

Deno.test("cleanup is checked before save, and over-length is an error", () => {
  const filler = "word ".repeat(82).trim() + ".";
  const raw = `${filler} Click here to buy now.`;
  const markdown = essayMarkdown("Title", raw);
  assertFalse(markdown.includes("Click here"));
  assertThrows(() => assertEssayLength(markdown, 100));
  assertThrows(() => essayReadyToSave("Title", raw, 100));
  const kept = essayReadyToSave("Title", filler, 90);
  assertStringIncludes(kept, "word");
  const long = "word ".repeat(200).trim() + ".";
  assertThrows(() => assertEssayLength(long, 100));
});

Deno.test("form writer radios are three known models and default to sonnet", () => {
  assertEquals(WRITER_OPTIONS.length, 3);
  assertEquals(WRITER_OPTIONS[0].id, "anthropic/claude-sonnet-5");
  for (const option of WRITER_OPTIONS) {
    assertEquals(isProviderModel(option.provider, option.id), true);
  }
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
  assertEquals(keyListWarning(curated, undefined), "");
});

Deno.test("system message still splits the Anthropic cache prefix", () => {
  const message = systemMessage("A frog fact.", "Write.", FROG_BRIEF);
  assertEquals(
    message.cachedPrefix?.startsWith(
      "Brief (from the user; it governs every choice below):",
    ),
    true,
  );
  assertEquals(groundingProblems("No figures here.", [], []).length, 0);
});
