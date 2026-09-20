// Newswire / finance RSS list (keyless, bot-friendly feeds only).
// Headline + link ONLY. Any feed that fails is silently dropped.
// finance=true feeds are used for the markets vertical; world news for geo.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry, parseFeed } from "../lib/fetch.ts";

interface Feed {
  name: string;
  url: string;
  finance: boolean;
}

// All URLs below verified to return HTTP 200 from the pipeline host with a
// descriptive UA (checked 2026-09-21).
const FEEDS: Feed[] = [
  // finance / markets
  { name: "cnbc-top", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", finance: true },
  { name: "marketwatch-top", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", finance: true },
  { name: "yahoo-finance", url: "https://finance.yahoo.com/news/rssindex", finance: true },
  { name: "investing-com", url: "https://www.investing.com/rss/news.rss", finance: true },
  { name: "seekingalpha", url: "https://seekingalpha.com/market_currents.xml", finance: true },
  { name: "fed-press", url: "https://www.federalreserve.gov/feeds/press_all.xml", finance: true },
  // world / geo
  { name: "bbc-world", url: "https://feeds.bbci.co.uk/news/world/rss.xml", finance: false },
  { name: "aljazeera-all", url: "https://www.aljazeera.com/xml/rss/all.xml", finance: false },
  { name: "dw-world", url: "https://rss.dw.com/rdf/rss-en-world", finance: false },
  { name: "guardian-world", url: "https://www.theguardian.com/world/rss", finance: false },
];

export const wire: Collector = {
  meta: {
    name: "wire",
    verticals: ["geo", "markets"],
    licenseNote: "Wire headlines are copyrighted; headline+link only, no excerpts",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    // For markets use finance feeds, for geo use world-news feeds.
    const feeds = FEEDS.filter((f) => (ctx.vertical === "markets" ? f.finance : !f.finance));
    const results = await Promise.all(
      feeds.map(async (feed) => {
        try {
          const res = await fetchWithRetry({ url: feed.url, timeoutMs: 15_000, retries: 2 });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.error ?? ""}`);
          const items = parseFeed(res.text)
            .slice(0, Math.min(ctx.limit, 15))
            .map((it) => ({
              source: "wire",
              vertical: ctx.vertical as RawItem["vertical"],
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
