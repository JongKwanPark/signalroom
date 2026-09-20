// Newswire RSS list (Reuters / AP public feeds if reachable).
// Headline + link ONLY. Any feed that fails is silently dropped.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry, parseFeed } from "../lib/fetch.ts";

// Public feed candidates; most Reuters/Bloomberg feeds are closed, so this
// list is best-effort and failures are dropped per policy.
const FEEDS = [
  { name: "reuters-world", url: "https://www.reuters.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "apnews-top", url: "https://apnews.com/index.rss" },
  { name: "apnews-apf-topnews", url: "https://rsshub.app/apnews/topics/apf-topnews" },
];

export const wire: Collector = {
  meta: {
    name: "wire",
    verticals: ["geo", "markets"],
    licenseNote: "Wire headlines are copyrighted; headline+link only, no excerpts",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const results = await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const res = await fetchWithRetry({ url: feed.url, timeoutMs: 15_000, retries: 2 });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.error ?? ""}`);
          const items = parseFeed(res.text)
            .slice(0, Math.min(ctx.limit, 15))
            .map((it) => ({
              source: "wire",
              vertical: "geo" as const,
              title: it.title,
              url: it.link,
              publishedAt: isoDate(it.publishedAt),
              licenseNote: `${feed.name}: headline+link only (copyrighted)`,
            }));
          ctx.log(`wire feed ${feed.name}: ${items.length} items`);
          return items;
        } catch (err: unknown) {
          ctx.log(`wire feed ${feed.name} dropped: ${err instanceof Error ? err.message : String(err)}`);
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
