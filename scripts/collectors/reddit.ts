// Reddit: subreddit RSS (r/MachineLearning, r/LocalLLaMA for ai;
// r/investing, r/wallstreetbets for markets) + www.reddit.com/search.json.
// License: Reddit API/content is non-commercial use only.
import type { Collector, CollectContext, RawItem, Vertical } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson, parseFeed, fetchWithRetry } from "../lib/fetch.ts";

const SUBREDDITS: Record<Vertical, string[]> = {
  ai: ["MachineLearning", "LocalLLaMA"],
  bio: [],
  geo: [],
  markets: ["investing", "wallstreetbets"],
};

const NONCOMMERCIAL = "Reddit data: non-commercial use only (Reddit User Agreement)";

export const reddit: Collector = {
  meta: {
    name: "reddit",
    verticals: ["ai", "markets"],
    licenseNote: NONCOMMERCIAL,
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const tasks: Array<{ vertical: Vertical; run: () => Promise<RawItem[]> }> = [];

    for (const [verticalStr, subs] of Object.entries(SUBREDDITS) as Array<[Vertical, string[]]>) {
      if (verticalStr !== ctx.vertical) continue;
      for (const sub of subs) {
        tasks.push({
          vertical: verticalStr,
          run: async () => {
            const hosts = ["www.reddit.com", "old.reddit.com"];
            let lastError = "";
            for (const host of hosts) {
              const res = await fetchWithRetry({
                url: `https://${host}/r/${sub}/hot/.rss?limit=${Math.min(ctx.limit, 50)}`,
                accept: "application/rss+xml",
                timeoutMs: 15_000,
              });
              if (res.ok) {
                return parseFeed(res.text).map((it) => ({
                  source: "reddit",
                  vertical: verticalStr,
                  title: it.title,
                  url: it.link,
                  publishedAt: normalizeDate(it.publishedAt),
                  excerpt: undefined,
                  licenseNote: NONCOMMERCIAL,
                }));
              }
              lastError = res.error ?? `HTTP ${res.status}`;
              if (res.status === 429) {
                // Reddit rate-limits datacenter IPs; wait briefly and retry once.
                await new Promise((r) => setTimeout(r, 5000));
                const retry = await fetchWithRetry({
                  url: `https://${host}/r/${sub}/hot/.rss?limit=${Math.min(ctx.limit, 50)}`,
                  accept: "application/rss+xml",
                  timeoutMs: 15_000,
                });
                if (retry.ok) {
                  return parseFeed(retry.text).map((it) => ({
                    source: "reddit",
                    vertical: verticalStr,
                    title: it.title,
                    url: it.link,
                    publishedAt: normalizeDate(it.publishedAt),
                    excerpt: undefined,
                    licenseNote: NONCOMMERCIAL,
                  }));
                }
                lastError = retry.error ?? `HTTP ${retry.status}`;
              }
            }
            throw new Error(`r/${sub} RSS (${lastError})`);
          },
        });
      }
    }

    // search.json top posts for AI keywords (non-commercial).
    if (ctx.vertical === "ai") {
      tasks.push({
        vertical: "ai",
      run: async () => {
        const res = await fetchJson<{ data?: { children?: Array<{ data: RedditPost }> } }>({
          url:
            "https://www.reddit.com/search.json?" +
            new URLSearchParams({
              q: "(LLM OR \"machine learning\")",
              sort: "new",
              t: "day",
              limit: String(Math.min(ctx.limit, 50)),
            }),
          timeoutMs: 15_000,
        });
        if (!res.ok) throw new Error(`search.json: ${res.error}`);
        const posts = (res.data?.data?.children ?? []).map((c) => c.data).filter((p): p is RedditPost & { title: string; url: string } => Boolean(p.title && p.url));
        return posts.map((p) => ({
          source: "reddit",
          vertical: "ai" as const,
          title: p.title,
          url: p.permalink ? `https://www.reddit.com${p.permalink}` : p.url,
          publishedAt: new Date((p.created_utc ?? 0) * 1000).toISOString(),
          author: p.author,
          engagement: (p.ups ?? 0) + (p.num_comments ?? 0),
          excerpt: truncateExcerpt(p.selftext ?? "", 400) || undefined,
          licenseNote: NONCOMMERCIAL,
        }));
      },
    });
    }

    const results = await Promise.all(
      tasks.map(async (t) => {
        try {
          return await t.run();
        } catch (err: unknown) {
          ctx.log(`reddit sub-task failed: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }
      })
    );

    return { items: results.flat() };
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
}

function normalizeDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
