// Hacker News via hn.algolia.com search_by_date API (free, no key).
// License: HN data API is open; content copyright stays with authors —
// headline + link only.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

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
    const url =
      "https://hn.algolia.com/api/v1/search_by_date?" +
      new URLSearchParams({
        query: "LLM",
        tags: "story",
        hitsPerPage: String(ctx.limit),
        numericFilters: `created_at_i>${secondsAgo(48 * 3600)}`,
      });
    const res = await fetchJson<{ hits: AlgoliaHit[] }>({ url, timeoutMs: 15_000 });
    if (!res.ok) throw new Error(res.error ?? "hn.algolia.com request failed");
    const items: RawItem[] = (res.data?.hits ?? [])
      .map((hit) => ({
        title: hit.title || hit.story_title || "",
        url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        publishedAt: hit.created_at ?? new Date((hit.created_at_i ?? 0) * 1000).toISOString(),
        author: hit.author,
        engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
      }))
      .filter((i) => i.title && i.url)
      .map((i) => ({ ...i, source: "hackernews", vertical: "ai" as const }));
    // Keep headline+link only for linked stories: no excerpt from HN text.
    return { items: items.map((i) => ({ ...i, excerpt: undefined })) };
  },
};

function secondsAgo(secs: number): number {
  return Math.floor(Date.now() / 1000) - secs;
}
