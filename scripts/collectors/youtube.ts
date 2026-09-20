// YouTube: channel RSS feeds only (search.list has hard limits; RSS is free).
// Title+link metadata only, per YouTube ToS.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry, parseFeed } from "../lib/fetch.ts";

const CHANNELS = [
  { name: "Two Minute Papers", id: "UCbfYPyITQ-7l4upoX8nvctg" },
];

export const youtube: Collector = {
  meta: {
    name: "youtube",
    verticals: ["ai"],
    licenseNote: "YouTube ToS: channel RSS metadata only; no API search.list",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const results = await Promise.all(
      CHANNELS.map(async (ch) => {
        try {
          const res = await fetchWithRetry({
            url: `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`,
            timeoutMs: 15_000,
          });
          if (!res.ok) throw new Error(`channel RSS: ${res.error}`);
          return parseFeed(res.text)
            .slice(0, Math.min(ctx.limit, 15))
            .map((it) => ({
              source: "youtube",
              vertical: "ai" as const,
              title: `${ch.name}: ${it.title}`,
              url: it.link,
              publishedAt: normalizeDate(it.publishedAt),
              licenseNote: "YouTube metadata via channel RSS",
            }));
        } catch (err: unknown) {
          ctx.log(`youtube channel ${ch.name} failed: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        }
      })
    );
    return { items: results.flat() };
  },
};

function normalizeDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
