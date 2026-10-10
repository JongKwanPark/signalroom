// Reddit listings with upvote counts, across more than one community per vertical.
// hot.json carries scores; RSS is the fallback when JSON is blocked.
// License: Reddit API/content is non-commercial use only.
import type { Collector, CollectContext, RawItem, Vertical } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson, parseFeed, fetchWithRetry } from "../lib/fetch.ts";

const SUBREDDITS: Record<Vertical, string[]> = {
  ai: ["MachineLearning", "LocalLLaMA", "artificial", "singularity", "ChatGPT", "OpenAI"],
  bio: [],
  geo: [],
  markets: ["investing", "wallstreetbets", "economics", "stocks"],
};

const NONCOMMERCIAL = "Reddit data: non-commercial use only (Reddit User Agreement)";
const LISTING_LIMIT = 25;

export const reddit: Collector = {
  meta: {
    name: "reddit",
    verticals: ["ai", "markets"],
    licenseNote: NONCOMMERCIAL,
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const subs = SUBREDDITS[ctx.vertical] ?? [];
    const tasks: Array<() => Promise<RawItem[]>> = subs.map((sub) => () => listing(ctx, sub));

    if (ctx.vertical === "ai") {
      tasks.push(() =>
        search(ctx, "ai", "(LLM OR \"machine learning\" OR OpenAI OR Anthropic OR Nvidia OR \"open source\")")
      );
    }
    if (ctx.vertical === "markets") {
      tasks.push(() => search(ctx, "markets", "(earnings OR Fed OR inflation OR stocks OR IPO)"));
    }

    const results = await mapPool(tasks, 1, async (run) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        return await run();
      } catch (err: unknown) {
        ctx.log(`reddit sub-task failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    });

    const items = mergeByUrl(results.flat());
    ctx.log(`reddit ${ctx.vertical}: ${subs.length} subs, ${items.length} unique`);
    return { items };
  },
};

interface RedditPost {
  title?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  author?: string;
  ups?: number;
  num_comments?: number;
  selftext?: string;
  score?: number;
}

async function listing(ctx: CollectContext, sub: string): Promise<RawItem[]> {
  const hosts = ["www.reddit.com", "old.reddit.com"];
  let lastError = "";
  for (const host of hosts) {
    const res = await fetchJson<{ data?: { children?: Array<{ data: RedditPost }> } }>({
      url: `https://${host}/r/${sub}/hot.json?` + new URLSearchParams({ limit: String(LISTING_LIMIT), raw_json: "1" }),
      timeoutMs: 15_000,
    });
    if (res.ok) {
      const posts = (res.data?.data?.children ?? []).map((child) => child.data);
      ctx.log(`reddit r/${sub} hot ${posts.length} via ${host}`);
      return posts.map((post) => toItem(ctx.vertical, post));
    }
    lastError = res.error ?? `HTTP ${res.status}`;
  }

  for (const host of hosts) {
    const res = await fetchWithRetry({
      url: `https://${host}/r/${sub}/hot/.rss?limit=${LISTING_LIMIT}`,
      accept: "application/rss+xml",
      timeoutMs: 15_000,
    });
    if (res.ok) {
      ctx.log(`reddit r/${sub} RSS fallback via ${host}`);
      return parseFeed(res.text).map((it) => ({
        source: "reddit",
        vertical: ctx.vertical,
        title: it.title,
        url: it.link,
        publishedAt: normalizeDate(it.publishedAt),
        excerpt: undefined,
        licenseNote: NONCOMMERCIAL,
      }));
    }
    lastError = res.error ?? `HTTP ${res.status}`;
  }
  throw new Error(`r/${sub} (${lastError})`);
}

async function search(ctx: CollectContext, vertical: Vertical, q: string): Promise<RawItem[]> {
  const res = await fetchJson<{ data?: { children?: Array<{ data: RedditPost }> } }>({
    url:
      "https://www.reddit.com/search.json?" +
      new URLSearchParams({
        q,
        sort: "top",
        t: "day",
        limit: String(Math.min(ctx.limit, 50)),
        raw_json: "1",
      }),
    timeoutMs: 15_000,
  });
  if (!res.ok) throw new Error(`search.json: ${res.error}`);
  const posts = (res.data?.data?.children ?? []).map((child) => child.data);
  ctx.log(`reddit search ${vertical} top/day ${posts.length}`);
  return posts.map((post) => toItem(vertical, post));
}

function toItem(vertical: Vertical, post: RedditPost): RawItem {
  const discussion = post.permalink ? `https://www.reddit.com${post.permalink}` : "";
  const linked = post.url && !isRedditHost(post.url) ? post.url : discussion || post.url || "";
  const score = post.ups ?? post.score ?? 0;
  return {
    source: "reddit",
    vertical,
    title: post.title ?? "",
    url: linked,
    publishedAt: new Date((post.created_utc ?? 0) * 1000).toISOString(),
    author: post.author,
    engagement: score + (post.num_comments ?? 0),
    excerpt: truncateExcerpt(post.selftext ?? "", 400) || undefined,
    licenseNote: NONCOMMERCIAL,
  };
}

function isRedditHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "reddit.com" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

function mergeByUrl(items: RawItem[]): RawItem[] {
  const byUrl = new Map<string, RawItem>();
  for (const item of items) {
    if (!item.title || !item.url) continue;
    const prev = byUrl.get(item.url);
    if (!prev || (item.engagement ?? 0) > (prev.engagement ?? 0)) byUrl.set(item.url, item);
  }
  return [...byUrl.values()].sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0));
}

function normalizeDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}
