// Institute for the Study of War (ISW) updates via understandingwar.org RSS.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry, parseFeed } from "../lib/fetch.ts";

export const isw: Collector = {
  meta: {
    name: "isw",
    verticals: ["geo"],
    licenseNote: "ISW content: link with attribution; no republishing of full text",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const candidates = ["https://www.understandingwar.org/rss.xml", "https://understandingwar.org/rss.xml"];
    let lastError = "unknown";
    for (const url of candidates) {
      const res = await fetchWithRetry({ url, timeoutMs: 15_000, retries: 2 });
      if (res.ok) {
        return {
          items: parseFeed(res.text)
            .slice(0, Math.min(ctx.limit, 20))
            .map((it) => ({
              source: "isw",
              vertical: "geo" as const,
              title: it.title,
              url: it.link,
              publishedAt: isoDate(it.publishedAt),
              licenseNote: "ISW; attribution + link only",
            })),
        };
      }
      lastError = res.error ?? `HTTP ${res.status}`;
    }
    throw new Error(`isw RSS: ${lastError}`);
  },
};

function isoDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
