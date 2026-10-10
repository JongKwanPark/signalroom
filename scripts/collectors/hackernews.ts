// Hacker News via hn.algolia.com (free, no key).
// License: HN data API is open; content copyright stays with authors —
// headline + link only.
//
// Two passes: recent "LLM" stories, plus stories that are actually popular
// (front page, or 50+ points in the last 48 hours) when the title is about AI.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

const LOOKBACK_SECONDS = 48 * 3600;
const POPULAR_MIN_POINTS = 50;
const POPULAR_HITS = 100;

const AI_TITLE = /\b(ai|llm|gpt|openai|anthropic|claude|gemini|nvidia|deepseek|chatgpt|copilot|machine learning|language model|foundation model|open[- ]weight)\b/i;

interface AlgoliaHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  created_at_i?: number;
}

export const hackernews: Collector = {
  meta: {
    name: "hackernews",
    verticals: ["ai"],
    licenseNote: "HN API open; content copyright with original authors (headline+link only)",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const since = secondsAgo(LOOKBACK_SECONDS);
    const [recent, popular, frontPage] = await Promise.all([
      fetchHits(ctx, recentUrl(ctx.limit, since), "recent"),
      fetchHits(ctx, popularUrl(since), "popular"),
      fetchHits(ctx, frontPageUrl(), "front page"),
    ]);
    if (recent == null && popular == null && frontPage == null) {
      throw new Error("hn.algolia.com request failed");
    }

    const popularAi = (popular ?? []).filter((hit) => AI_TITLE.test(hit.title || hit.story_title || ""));
    const frontPageAi = (frontPage ?? []).filter((hit) => AI_TITLE.test(hit.title || hit.story_title || ""));
    const merged = mergeByUrl([...(recent ?? []), ...popularAi, ...frontPageAi]);
    ctx.log(
      `hackernews recent ${recent?.length ?? 0}, popular-ai ${popularAi.length}, front-page-ai ${frontPageAi.length}, unique ${merged.length}`
    );
    return { items: merged.map(toItem) };
  },
};

function recentUrl(limit: number, since: number): string {
  return (
    "https://hn.algolia.com/api/v1/search_by_date?" +
    new URLSearchParams({
      query: "AI OR LLM OR GPT OR OpenAI OR Anthropic OR Claude OR Nvidia OR DeepSeek",
      tags: "story",
      hitsPerPage: String(limit),
      numericFilters: `created_at_i>${since}`,
    })
  );
}

function popularUrl(since: number): string {
  return (
    "https://hn.algolia.com/api/v1/search?" +
    new URLSearchParams({
      tags: "story",
      hitsPerPage: String(POPULAR_HITS),
      numericFilters: `created_at_i>${since},points>=${POPULAR_MIN_POINTS}`,
    })
  );
}

function frontPageUrl(): string {
  return "https://hn.algolia.com/api/v1/search?" + new URLSearchParams({ tags: "front_page", hitsPerPage: "50" });
}

async function fetchHits(ctx: CollectContext, url: string, label: string): Promise<AlgoliaHit[] | null> {
  const res = await fetchJson<{ hits: AlgoliaHit[] }>({ url, timeoutMs: 15_000 });
  if (!res.ok) {
    ctx.log(`hackernews ${label} failed: ${res.error ?? "request failed"}`);
    return null;
  }
  return res.data?.hits ?? [];
}

function mergeByUrl(hits: AlgoliaHit[]): AlgoliaHit[] {
  const byUrl = new Map<string, AlgoliaHit>();
  for (const hit of hits) {
    const url = hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
    const prev = byUrl.get(url);
    if (!prev || engagementOf(hit) > engagementOf(prev)) byUrl.set(url, hit);
  }
  return [...byUrl.values()]
    .filter((hit) => (hit.title || hit.story_title) && (hit.url || hit.story_url || hit.objectID))
    .sort((a, b) => engagementOf(b) - engagementOf(a));
}

function engagementOf(hit: AlgoliaHit): number {
  return (hit.points ?? 0) + (hit.num_comments ?? 0);
}

function toItem(hit: AlgoliaHit): RawItem {
  return {
    source: "hackernews",
    vertical: "ai",
    title: hit.title || hit.story_title || "",
    url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    publishedAt: hit.created_at ?? new Date((hit.created_at_i ?? 0) * 1000).toISOString(),
    author: hit.author,
    engagement: engagementOf(hit),
    excerpt: undefined,
  };
}

function secondsAgo(secs: number): number {
  return Math.floor(Date.now() / 1000) - secs;
}
