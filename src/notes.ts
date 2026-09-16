export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
export const MAX_SOURCES = 5;
export const EXCERPT_WORDS = 180;

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

function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) =>
    word.length > 3 && !STOP_WORDS.has(word)
  ) ?? [];
}

export function searchQuery(topic: string): string {
  const stripped = topic
    .replace(/^write an? \d+[ -]?word blog post\.?\s*/i, "")
    .replace(/^use only these notes\.?\s*/i, "")
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

function excerpt(text: string): string {
  return claimText(text).split(" ").filter(Boolean).slice(0, EXCERPT_WORDS)
    .join(" ");
}

export function sourceNotes(hits: SearchHit[]): string {
  return hits.filter((hit) => hit.url && countWords(hit.content) >= 15).slice(
    0,
    MAX_SOURCES,
  ).map((hit) =>
    `Source: ${hit.title}\nURL: ${hit.url}\n${excerpt(hit.content)}`
  ).join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hitsFromPayload(payload: unknown): SearchHit[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
  const hits: SearchHit[] = [];
  for (const item of payload.results) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const title = typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : url;
    const summary = typeof item.content === "string" ? item.content : "";
    const content = excerpt(summary);
    if (!url || countWords(content) < 15) continue;
    hits.push({ title, url, content });
  }
  return hits;
}

export function relevantToQuery(query: string, hit: SearchHit): boolean {
  const distinctive = contentWords(query).filter((word) =>
    word.length > 5 && !GENERIC_QUERY_WORDS.has(word)
  );
  if (distinctive.length === 0) return true;
  const haystack = new Set(contentWords(`${hit.title} ${hit.content}`));
  return distinctive.some((word) => haystack.has(word));
}

export function selectHits(query: string, hits: SearchHit[]): SearchHit[] {
  return hits.filter((hit) => relevantToQuery(query, hit)).slice(
    0,
    MAX_SOURCES,
  );
}

export async function gatherResearch(topic: string): Promise<{
  text: string;
  count: number;
  query: string;
  hits: SearchHit[];
}> {
  const query = searchQuery(topic);
  if (!query) return { text: "", count: 0, query, hits: [] };
  const key = envGet("TAVILY_API_KEY");
  try {
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
        max_results: 8,
        search_depth: "advanced",
        chunks_per_source: 3,
        include_answer: false,
        include_raw_content: false,
        exclude_domains: ["youtube.com", "www.youtube.com"],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.log(`Research: none (HTTP ${response.status})`);
      return { text: "", count: 0, query, hits: [] };
    }
    const hits = selectHits(query, hitsFromPayload(await response.json()));
    return { text: sourceNotes(hits), count: hits.length, query, hits };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.log(`Research: none (${message})`);
    return { text: "", count: 0, query, hits: [] };
  }
}
