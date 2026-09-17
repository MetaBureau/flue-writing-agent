import { DEFAULT_ESSAY_LENGTH } from "./contract.ts";

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
export const MAX_SOURCES = 5;
export const EXCERPT_WORDS = 180;
export const MAX_RESEARCH_SOURCES = 12;
export const MAX_EXCERPT_WORDS = 400;
export const MAX_SEARCH_RESULTS = 20;

const MILL_DOMAINS = [
  "bartleby.com",
  "brainly.com",
  "brainly.in",
  "edubirdie.com",
  "gradesaver.com",
  "ivypanda.com",
  "schoolessaywriter.com",
  "scribd.com",
  "strictlywriting.com",
  "studymoose.com",
  "vedantu.com",
  "youtube.com",
  "www.youtube.com",
];

const GENERIC_QUERY_WORDS = new Set([
  "search",
  "writing",
  "agents",
  "about",
  "blog",
  "words",
  "using",
  "write",
  "posts",
  "essay",
  "essays",
]);
const STOP_WORDS = new Set(
  "the a an and or of to in on for with from that this these those was were been being have has had not but its their they them you your only into via by as at than then also when while"
    .split(" "),
);
const FURNITURE =
  /\b(subscribers?|likes|views|bootcamp|colombo|lkr|seats|sign in|sign up|copyright|lukrembo|music track|followers|unknown user|authored|written by)\b|press enter or click|view image in full size|reach out/i;

export interface SearchHit {
  title: string;
  url: string;
  content: string;
}

export interface ResearchNotes {
  text: string;
  count: number;
  query: string;
  hits: SearchHit[];
}

export interface ResearchBudget {
  sources: number;
  excerptWords: number;
  maxResults: number;
}

export function researchBudget(words: number): ResearchBudget {
  const target = Math.max(words, 500);
  const sources = Math.min(
    MAX_RESEARCH_SOURCES,
    Math.max(8, Math.ceil(target / 100)),
  );
  const excerptWords = Math.min(
    MAX_EXCERPT_WORDS,
    Math.max(EXCERPT_WORDS, Math.ceil(target / 3)),
  );
  const maxResults = Math.min(MAX_SEARCH_RESULTS, sources + 4);
  return { sources, excerptWords, maxResults };
}

function envGet(name: string): string | undefined {
  const proc =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process;
  const fromNode = proc?.env?.[name];
  if (fromNode) return fromNode;
  const deno = (globalThis as {
    Deno?: { env: { get(name: string): string | undefined } };
  }).Deno;
  return deno?.env.get(name);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function searchQuery(topic: string): string {
  const stripped = topic
    .replace(/^write an? \d+[ -]?word blog post\.?\s*/i, "")
    .replace(/^use only these notes\.?\s*/i, "")
    .replace(
      /^(?:write\s+)?(?:an?\s+)?(?:\d+[ -]?word\s+)?essay\s+(?:about|on)\s+/i,
      "",
    )
    .trim();
  const firstBlock = stripped.split(/\n\n+/).find((block) => block.trim()) ??
    stripped;
  const sentence = firstBlock.split(/(?<=[.!?])\s+/)[0] ?? firstBlock;
  return sentence.replace(/\s+/g, " ").trim().slice(0, 400);
}

export function claimText(text: string): string {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return sentences.filter((sentence) => sentence && !FURNITURE.test(sentence))
    .join(" ");
}

function excerpt(text: string, limit = EXCERPT_WORDS): string {
  return claimText(text).split(" ").filter(Boolean).slice(0, limit)
    .join(" ");
}

export function sourceNotes(
  hits: SearchHit[],
  excerptWords = EXCERPT_WORDS,
  sources = MAX_SOURCES,
): string {
  return hits.filter((hit) => hit.url && countWords(hit.content) >= 15).slice(
    0,
    sources,
  ).map((hit) =>
    `Source: ${hit.title}\nURL: ${hit.url}\n${
      excerpt(hit.content, excerptWords)
    }`
  ).join("\n\n");
}

export function noteWordCount(text: string): number {
  return countWords(
    text.split("\n").filter((line) => !/^(?:Source|URL):/i.test(line.trim()))
      .join(" "),
  );
}

export function mergeHits(base: SearchHit[], extra: SearchHit[]): SearchHit[] {
  const seen = new Set(base.map((hit) => hit.url));
  return [...base, ...extra.filter((hit) => hit.url && !seen.has(hit.url))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hitsFromPayload(
  payload: unknown,
  excerptWords = EXCERPT_WORDS,
): SearchHit[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
  const hits: SearchHit[] = [];
  for (const item of payload.results) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const title = typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : url;
    const summary = typeof item.content === "string" ? item.content : "";
    const content = excerpt(summary, excerptWords);
    if (!url || countWords(content) < 15) continue;
    hits.push({ title, url, content });
  }
  return hits;
}

export function subjectWords(query: string): string[] {
  const words =
    query.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) =>
      word.length > 2 && !STOP_WORDS.has(word) && !GENERIC_QUERY_WORDS.has(word)
    ) ?? [];
  return [...new Set(words)];
}

export function relevantToQuery(query: string, hit: SearchHit): boolean {
  const distinctive = subjectWords(query);
  if (distinctive.length === 0) return true;
  const raw = `${hit.title} ${hit.content}`.toLowerCase();
  return distinctive.some((word) => new RegExp(`\\b${word}s?\\b`).test(raw));
}

export function selectHits(
  query: string,
  hits: SearchHit[],
  sources = MAX_SOURCES,
): SearchHit[] {
  return hits.filter((hit) => relevantToQuery(query, hit)).slice(0, sources);
}

async function searchHits(
  query: string,
  budget: ResearchBudget,
): Promise<SearchHit[]> {
  if (!query) return [];
  const key = envGet("TAVILY_API_KEY");
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key
        ? { Authorization: `Bearer ${key}` }
        : { "X-Tavily-Access-Mode": "keyless" }),
    },
    body: JSON.stringify({
      query,
      max_results: budget.maxResults,
      search_depth: "advanced",
      chunks_per_source: 3,
      include_answer: false,
      include_raw_content: false,
      exclude_domains: MILL_DOMAINS,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    console.log(`Research: none (HTTP ${response.status})`);
    return [];
  }
  return selectHits(
    query,
    hitsFromPayload(await response.json(), budget.excerptWords),
    budget.sources,
  );
}

function researchFromHits(
  query: string,
  hits: SearchHit[],
  budget: ResearchBudget,
): ResearchNotes {
  return {
    text: sourceNotes(hits, budget.excerptWords, budget.sources),
    count: hits.length,
    query,
    hits,
  };
}

export async function gatherResearch(
  topic: string,
  words = DEFAULT_ESSAY_LENGTH,
): Promise<ResearchNotes> {
  const query = searchQuery(topic);
  const budget = researchBudget(words);
  if (!query) return { text: "", count: 0, query, hits: [] };
  try {
    const hits = await searchHits(query, budget);
    return researchFromHits(query, hits, budget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.log(`Research: none (${message})`);
    return { text: "", count: 0, query, hits: [] };
  }
}

export async function supplementResearch(
  prior: ResearchNotes,
  sections: string[],
  words: number,
): Promise<ResearchNotes> {
  const budget = researchBudget(words);
  const query = sections.map((section) => section.trim()).filter(Boolean)
    .slice(0, 4).join(". ").slice(0, 400);
  if (!query) return prior;
  try {
    const extra = await searchHits(query, budget);
    const merged = mergeHits(prior.hits, extra);
    const hits = selectHits(
      `${prior.query} ${query}`,
      merged,
      Math.min(MAX_RESEARCH_SOURCES, Math.max(budget.sources, merged.length)),
    );
    if (hits.length === 0) return prior;
    return researchFromHits(prior.query, hits, budget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.log(`Research: no extra notes (${message})`);
    return prior;
  }
}
