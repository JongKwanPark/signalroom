// Journal / health-press RSS for the bio vertical (best-effort public feeds;
// failures dropped). Headline+link only for copyrighted publisher feeds.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry, parseFeed } from "../lib/fetch.ts";

const FEEDS = [
  { name: "nature", url: "https://www.nature.com/nature.rss" },
  { name: "statnews", url: "https://www.statnews.com/feed/" },
  { name: "sciencedaily", url: "https://www.sciencedaily.com/rss/top/health.xml" },
];

export const journal_rss: Collector = {
  meta: {
    name: "journal_rss",
    verticals: ["bio"],
    licenseNote: "Publisher feeds: headline+link only (copyrighted abstracts/text)",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const results = await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const res = await fetchWithRetry({ url: feed.url, timeoutMs: 15_000, retries: 2 });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.error ?? ""}`);
          return parseFeed(res.text)
            .slice(0, Math.min(ctx.limit, 15))
            .map((it) => ({
              source: "journal_rss",
              vertical: "bio" as const,
              title: it.title,
              url: it.link,
              publishedAt: isoDate(it.publishedAt),
              licenseNote: `${feed.name}: headline+link only`,
            }));
        } catch (err: unknown) {
          ctx.log(`journal_rss feed ${feed.name} dropped: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }
      })
    );
    return { items: results.flat() };
  },
};

function isoDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
