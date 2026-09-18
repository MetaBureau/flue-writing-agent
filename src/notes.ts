import { DEFAULT_ESSAY_LENGTH } from "./contract.ts";
import { runFetchSignal } from "./complete.ts";

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
export const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
export const MAX_SOURCES = 5;
export const EXCERPT_WORDS = 180;
export const MAX_RESEARCH_SOURCES = 12;
export const MAX_EXCERPT_WORDS = 400;
export const MAX_SEARCH_RESULTS = 20;
export const EXTRACT_LIMIT = 8;
export const MIN_ARTICLE_CHARS = 400;

export function noteFloor(words: number): number {
  if (words <= 1000) return 6;
  if (words <= 2000) return 8;
  return 10;
}

export function researchFloorMessage(
  noteCount: number,
  words: number,
): string | undefined {
  const floor = noteFloor(words);
  if (noteCount >= floor) return undefined;
  return `Research is below the source floor (${noteCount}/${floor} notes). Draft from the brief. Do not invent statistics, studies, quotes, or sources.`;
}

function tavilyErrorText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    return pickTavilyError(JSON.parse(trimmed)).replace(/\s+/g, " ").trim()
      .slice(0, 240);
  } catch {
    return trimmed.replace(/\s+/g, " ").trim().slice(0, 240);
  }
}

function pickTavilyError(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  for (const key of ["error", "detail", "message"]) {
    const found = pickTavilyError(row[key]);
    if (found) return found;
  }
  return "";
}

export function tavilyStatusWhy(status: number): string {
  if (status === 401) return "the API key was rejected";
  if (status === 403) return "the API key is forbidden";
  if (status === 429) return "rate limited";
  if (status === 432) return "this API key hit its usage limit";
  return "";
}

export function tavilyFailure(status: number, body: string): string {
  const why = tavilyStatusWhy(status);
  const reason = tavilyErrorText(body);
  const parts = [`Tavily HTTP ${status}`];
  if (why) parts.push(why);
  if (reason) parts.push(reason);
  return parts.join(": ");
}

export function extractLimitFor(words: number): number {
  return Math.max(EXTRACT_LIMIT, noteFloor(words));
}

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

const SOCIAL_DOMAINS = [
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "instagram.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

const FARM_DOMAINS = [
  "a-z-animals.com",
  "animalwised.com",
  "curacao-nature.com",
  "differencebetween.com",
  "differencebetween.net",
  "ehow.com",
  "factanimal.com",
  "frogdetails.com",
  "hubpages.com",
  "listverse.com",
  "mramphibian.com",
  "owlcation.com",
  "ranker.com",
  "thoughtco.com",
  "wikihow.com",
  "wildlifeinformer.com",
  "wisegeek.com",
  "worldatlas.com",
  "yourarticlelibrary.com",
];

const HOST_OUTLETS: Record<string, string> = {
  "abc.net.au": "ABC",
  "afr.com": "Australian Financial Review",
  "apnews.com": "Associated Press",
  "aspi.org.au": "ASPI",
  "bbc.co.uk": "BBC",
  "bbc.com": "BBC",
  "canberratimes.com.au": "Canberra Times",
  "crikey.com.au": "Crikey",
  "dvm360.com": "dvm360",
  "froglife.org": "Froglife",
  "independentaustralia.net": "Independent Australia",
  "inside.org.au": "Inside Story",
  "lowyinstitute.org": "Lowy Institute",
  "news.com.au": "News.com.au",
  "nytimes.com": "New York Times",
  "pm.gov.au": "Prime Minister of Australia",
  "en.wikipedia.org": "Wikipedia",
  "wikipedia.org": "Wikipedia",
  "pearlsandirritations.com": "Pearls and Irritations",
  "quarterlyessay.com": "Quarterly Essay",
  "reuters.com": "Reuters",
  "sbs.com.au": "SBS",
  "smh.com.au": "Sydney Morning Herald",
  "theage.com.au": "The Age",
  "theaustralian.com.au": "The Australian",
  "theconversation.com": "The Conversation",
  "theguardian.com": "The Guardian",
  "thesaturdaypaper.com.au": "The Saturday Paper",
  "washingtonpost.com": "Washington Post",
};

const BLOCKED_DOMAINS = [...MILL_DOMAINS, ...SOCIAL_DOMAINS, ...FARM_DOMAINS];

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
  "architecture",
  "architectural",
  "architecting",
  "implementation",
  "implementing",
  "explain",
  "explaining",
  "purpose",
  "audience",
  "constraints",
  "technical",
  "builders",
  "database",
  "system",
  "product",
  "library",
  "framework",
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
  publishedAt?: string;
}

export interface Article {
  url: string;
  title: string;
  text: string;
  publishedAt: string;
}

export interface NoteClaim {
  claim: string;
  quote: string;
}

export interface SourceNote {
  id: string;
  url: string;
  title: string;
  author: string;
  outlet: string;
  date: string;
  stance: string;
  claims: NoteClaim[];
}

export interface ResearchNotes {
  text: string;
  count: number;
  query: string;
  counterQuery: string;
  hits: SearchHit[];
  articles: Article[];
  error?: string;
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
    Math.max(8, noteFloor(target), Math.ceil(target / 100)),
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

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `https://${host}${path}`;
  } catch {
    return url.trim();
  }
}

export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleWords(title: string): string[] {
  return [...new Set(
    titleKey(title).split(" ").filter((word) =>
      word.length > 2 && !STOP_WORDS.has(word)
    ),
  )];
}

export function samePublication(
  a: { title: string; url: string },
  b: { title: string; url: string },
): boolean {
  if (!a.url || !b.url) return false;
  if (canonicalUrl(a.url) === canonicalUrl(b.url)) return true;
  const titleA = titleKey(a.title);
  const titleB = titleKey(b.title);
  if (titleA && titleA === titleB) return true;
  if (hostOf(a.url) !== hostOf(b.url) || !titleA || !titleB) return false;
  const wordsA = titleWords(a.title);
  const wordsB = titleWords(b.title);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const other = new Set(wordsB);
  const overlap = wordsA.filter((word) => other.has(word)).length;
  const need = Math.max(
    3,
    Math.ceil(Math.min(wordsA.length, wordsB.length) * 0.7),
  );
  return overlap >= need;
}

function alreadyHavePublication(
  have: readonly { title: string; url: string }[],
  item: { title: string; url: string },
): boolean {
  return have.some((existing) => samePublication(existing, item));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function compactBrand(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function outletFromHost(url: string): string {
  const host = hostOf(url);
  if (!host) return "";
  const known = HOST_OUTLETS[host];
  if (known) return known;
  const label = host.split(".")[0] ?? host;
  return label.split("-").filter(Boolean).map((word) =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(" ");
}

export function outletMatchesDomain(outlet: string, url: string): boolean {
  const claimed = outlet.trim();
  if (!claimed) return true;
  const host = hostOf(url);
  if (!host) return false;
  const known = HOST_OUTLETS[host];
  const compactClaimed = compactBrand(claimed);
  if (known && compactBrand(known) === compactClaimed) return true;
  if (compactClaimed.length < 3) return false;
  const compactHost = compactBrand(host);
  if (compactHost.includes(compactClaimed)) return true;
  const label = compactBrand(host.split(".")[0] ?? "");
  if (label.length >= 3 && compactClaimed.includes(label)) return true;
  if (label.length >= 4 && label.includes(compactClaimed)) return true;
  return false;
}

export function resolvedOutlet(outlet: string, url: string): string {
  if (outletMatchesDomain(outlet, url) && outlet.trim()) return outlet.trim();
  return outletFromHost(url);
}

export function quoteInArticle(quote: string, text: string): boolean {
  const needle = normalizeForMatch(quote);
  if (!needle) return true;
  return normalizeForMatch(text).includes(needle);
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isEncyclopaediaOrLiveBlog(url: string, title = ""): boolean {
  const host = hostOf(url);
  if (
    host === "wikipedia.org" || host.endsWith(".wikipedia.org") ||
    host === "britannica.com" || host.endsWith(".britannica.com")
  ) {
    return true;
  }
  if (/encyclop(?:a|e)edia/i.test(host) || /encyclop(?:a|e)edia/i.test(title)) {
    return true;
  }
  if (/live\s*blog/i.test(title) || /\/live(?:-blog)?(?:\/|$|\?)/i.test(url)) {
    return true;
  }
  return false;
}

export function isBlockedSource(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return true;
  }
  return BLOCKED_DOMAINS.some((domain) =>
    host === domain.replace(/^www\./, "") ||
    host.endsWith(`.${domain.replace(/^www\./, "")}`)
  );
}

export function mergeHits(base: SearchHit[], extra: SearchHit[]): SearchHit[] {
  const urls = new Set(base.map((hit) => canonicalUrl(hit.url)));
  const titles = new Set(
    base.map((hit) => titleKey(hit.title)).filter(Boolean),
  );
  const next = [...base];
  for (const hit of extra) {
    if (!hit.url || isBlockedSource(hit.url)) continue;
    const url = canonicalUrl(hit.url);
    const title = titleKey(hit.title);
    if (urls.has(url) || (title && titles.has(title))) continue;
    if (alreadyHavePublication(next, hit)) continue;
    urls.add(url);
    if (title) titles.add(title);
    next.push(hit);
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function publishedField(item: Record<string, unknown>): string {
  const value = item.published_date ?? item.publishedAt;
  return typeof value === "string" ? value.trim() : "";
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
    hits.push({
      title,
      url,
      content,
      publishedAt: publishedField(item),
    });
  }
  return hits;
}

export function subjectWords(query: string): string[] {
  const words =
    query.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) =>
      !STOP_WORDS.has(word) &&
      !GENERIC_QUERY_WORDS.has(word) &&
      (word.length > 2 || /\d/.test(word))
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
  return hits
    .filter((hit) => !isBlockedSource(hit.url) && relevantToQuery(query, hit))
    .slice(0, sources);
}

export function articlesFromHits(hits: SearchHit[]): Article[] {
  return hits
    .filter((hit) =>
      !isBlockedSource(hit.url) && countWords(hit.content) >= 15
    )
    .map((hit) => ({
      url: hit.url,
      title: hit.title,
      text: hit.content,
      publishedAt: hit.publishedAt ?? "",
    }));
}

export function failedExtractUrls(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.failed_results)) return [];
  const urls: string[] = [];
  for (const item of payload.failed_results) {
    if (typeof item === "string" && item.trim()) {
      urls.push(item.trim());
      continue;
    }
    if (isRecord(item) && typeof item.url === "string" && item.url.trim()) {
      urls.push(item.url.trim());
    }
  }
  return urls;
}

export function mergeArticles(
  extracted: Article[],
  fallback: Article[],
): Article[] {
  const next = [...extracted];
  for (const article of fallback) {
    if (isBlockedSource(article.url) || alreadyHavePublication(next, article)) {
      continue;
    }
    next.push(article);
  }
  return next;
}

export function articlesFromExtract(
  hits: SearchHit[],
  payload: unknown,
): Article[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
  const byUrl = new Map(hits.map((hit) => [canonicalUrl(hit.url), hit]));
  const articles: Article[] = [];
  const seen = new Set<string>();
  for (const item of payload.results) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const text = typeof item.raw_content === "string" ? item.raw_content.trim() : "";
    if (!url || text.length < MIN_ARTICLE_CHARS) continue;
    const key = canonicalUrl(url);
    if (seen.has(key) || isBlockedSource(url)) continue;
    const hit = byUrl.get(key);
    const article = {
      url: hit?.url ?? url,
      title: hit?.title ||
        (typeof item.title === "string" ? item.title : url),
      text,
      publishedAt: hit?.publishedAt ?? "",
    };
    if (alreadyHavePublication(articles, article)) continue;
    seen.add(key);
    articles.push(article);
  }
  return articles;
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

export function sourceNotesFromUnknown(value: unknown): SourceNote[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.notes)
    ? value.notes
    : [];
  const notes: SourceNote[] = [];
  for (const [index, item] of rows.entries()) {
    if (!isRecord(item)) continue;
    const url = stringField(item, "url");
    if (!url) continue;
    const claims: NoteClaim[] = [];
    const rawClaims = item.claims;
    if (Array.isArray(rawClaims)) {
      for (const claim of rawClaims) {
        if (!isRecord(claim)) continue;
        const text = stringField(claim, "claim");
        const quote = stringField(claim, "quote");
        if (!text && !quote) continue;
        claims.push({ claim: text || quote, quote });
      }
    }
    notes.push({
      id: stringField(item, "id") || `n${index + 1}`,
      url,
      title: stringField(item, "title") || url,
      author: stringField(item, "author"),
      outlet: resolvedOutlet(stringField(item, "outlet"), url),
      date: stringField(item, "date") || stringField(item, "publishedAt"),
      stance: stringField(item, "stance") || "unknown",
      claims,
    });
  }
  return notes.map((note, index) => ({ ...note, id: `n${index + 1}` }));
}

export function formatAttributedNotes(notes: readonly SourceNote[]): string {
  return notes.map((note) => {
    const who = [note.outlet, note.author, note.date].filter(Boolean).join(
      ", ",
    );
    const claims = note.claims.map((claim) =>
      `- ${claim.claim}${claim.quote ? `\n  Quote: "${claim.quote}"` : ""}`
    ).join("\n");
    return [
      `[${note.id}] ${note.title}`,
      who,
      `URL: ${note.url}`,
      `Stance: ${note.stance}`,
      claims,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

export function formatArticles(articles: readonly Article[]): string {
  return articles.map((article, index) =>
    `Article n${index + 1}\nTitle: ${article.title}\nURL: ${article.url}\nDate: ${article.publishedAt || "unknown"}\n\n${article.text}`
  ).join("\n\n----\n\n");
}

async function tavilyPost(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const key = envGet("TAVILY_API_KEY");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key
        ? { Authorization: `Bearer ${key}` }
        : { "X-Tavily-Access-Mode": "keyless" }),
    },
    body: JSON.stringify(body),
    signal: runFetchSignal(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(tavilyFailure(response.status, await response.text()));
  }
  return await response.json();
}

async function searchHits(
  query: string,
  budget: ResearchBudget,
): Promise<SearchHit[]> {
  if (!query) return [];
  const payload = await tavilyPost(TAVILY_SEARCH_URL, {
    query,
    max_results: budget.maxResults,
    search_depth: "advanced",
    include_answer: false,
    include_raw_content: false,
    exclude_domains: BLOCKED_DOMAINS,
  }, 20_000);
  return selectHits(
    query,
    hitsFromPayload(payload, budget.excerptWords),
    budget.sources,
  );
}

export async function extractArticles(
  hits: SearchHit[],
  limit = EXTRACT_LIMIT,
): Promise<Article[]> {
  const selected = hits.filter((hit) => !isBlockedSource(hit.url)).slice(
    0,
    limit,
  );
  if (selected.length === 0) return [];
  const payload = await tavilyPost(TAVILY_EXTRACT_URL, {
    urls: selected.map((hit) => hit.url),
    extract_depth: "advanced",
    format: "markdown",
    include_images: false,
  }, 60_000);
  const extracted = articlesFromExtract(selected, payload);
  const failed = new Set(
    failedExtractUrls(payload).map((url) => canonicalUrl(url)),
  );
  if (failed.size > 0) {
    console.log(`Extract: ${failed.size} URL(s) failed; using search snippets`);
  }
  const missing = selected.filter((hit) => {
    const key = canonicalUrl(hit.url);
    return failed.has(key) ||
      !extracted.some((article) => canonicalUrl(article.url) === key);
  });
  return mergeArticles(extracted, articlesFromHits(missing));
}

function emptyResearch(
  query: string,
  counterQuery = "",
  error?: string,
): ResearchNotes {
  return {
    text: "",
    count: 0,
    query,
    counterQuery,
    hits: [],
    articles: [],
    error,
  };
}

function researchFromArticles(
  query: string,
  counterQuery: string,
  hits: SearchHit[],
  articles: Article[],
): ResearchNotes {
  return {
    text: articles.map((article) =>
      `Source: ${article.title}\nURL: ${article.url}\nDate: ${article.publishedAt || "unknown"}`
    ).join("\n\n"),
    count: articles.length,
    query,
    counterQuery,
    hits,
    articles,
  };
}

export async function gatherResearch(
  topic: string,
  words = DEFAULT_ESSAY_LENGTH,
  counter = "",
): Promise<ResearchNotes> {
  const query = searchQuery(topic);
  const budget = researchBudget(words);
  if (!query) return emptyResearch(query, counter);
  try {
    const primary = await searchHits(query, budget);
    const opposing = counter
      ? await searchHits(counter, budget).catch(() => [] as SearchHit[])
      : [];
    const limit = extractLimitFor(words);
    const hits = selectHits(
      `${query} ${counter}`.trim(),
      mergeHits(primary, opposing),
      limit,
    );
    let articles = hits.length > 0
      ? await extractArticles(hits, limit).catch((error) => {
        const message = error instanceof Error ? error.message : "request failed";
        console.log(`Extract: failed (${message}); using search snippets`);
        return articlesFromHits(hits);
      })
      : [];
    if (articles.length === 0 && hits.length > 0) {
      articles = articlesFromHits(hits);
    }
    return researchFromArticles(query, counter, hits, articles);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.log(`Research: none (${message})`);
    return emptyResearch(query, counter, message);
  }
}

export async function supplementResearch(
  current: ResearchNotes,
  queries: readonly string[],
  words = DEFAULT_ESSAY_LENGTH,
): Promise<ResearchNotes> {
  const budget = researchBudget(words);
  const limit = extractLimitFor(words);
  let hits = current.hits;
  let error = current.error;
  for (const query of queries.map((item) => item.trim()).filter(Boolean).slice(0, 3)) {
    try {
      hits = mergeHits(hits, await searchHits(query, budget));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "request failed";
    }
  }
  hits = selectHits(
    [current.query, current.counterQuery, ...queries].join(" ").trim(),
    hits,
    limit,
  );
  const fresh = hits.filter((hit) =>
    !alreadyHavePublication(current.articles, hit)
  );
  const extracted = fresh.length > 0
    ? await extractArticles(fresh, limit).catch((error) => {
      const message = error instanceof Error ? error.message : "request failed";
      console.log(`Extract: failed (${message}); using search snippets`);
      return articlesFromHits(fresh);
    })
    : [];
  const next = researchFromArticles(
    current.query,
    current.counterQuery,
    hits,
    mergeArticles(current.articles, extracted.length > 0 ? extracted : articlesFromHits(fresh)),
  );
  if (error && next.articles.length === 0) next.error = error;
  return next;
}

export function mergeNotes(
  base: readonly SourceNote[],
  extra: readonly SourceNote[],
): SourceNote[] {
  const next = [...base];
  for (const note of extra) {
    if (alreadyHavePublication(next, note)) continue;
    next.push({ ...note, id: `n${next.length + 1}` });
  }
  return next;
}
