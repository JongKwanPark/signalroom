// Polymarket Gamma API: active markets (used by geo + markets verticals).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface Market {
  question?: string;
  slug?: string;
  endDate?: string;
  startDate?: string;
  volumeNum?: number;
  liquidityNum?: number;
}

export const polymarket: Collector = {
  meta: {
    name: "polymarket",
    verticals: ["geo", "markets"],
    licenseNote: "Gamma API public data; prediction-market quotes are factual data",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const url =
      "https://gamma-api.polymarket.com/markets?" +
      new URLSearchParams({
        limit: String(Math.min(ctx.limit, 40)),
        active: "true",
        closed: "false",
        order: "volumeNum",
        ascending: "false",
      });
    const res = await fetchJson<Market[] | { data?: Market[] }>({ url, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`polymarket: ${res.error}`);
    const markets = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    const items: RawItem[] = markets
      .filter((m): m is { question: string; slug?: string; endDate?: string; startDate?: string; volumeNum?: number; liquidityNum?: number } =>
        Boolean(m.question && (m.slug || m.question)))
      .map((m) => ({
        source: "polymarket",
        vertical: "geo" as const,
        title: m.question.trim(),
        url: `https://polymarket.com/market/${m.slug}`,
        publishedAt: m.startDate ?? m.endDate ?? new Date().toISOString(),
        engagement: m.volumeNum ?? m.liquidityNum ?? 0,
        licenseNote: "Polymarket Gamma API public data",
      }));
    return { items };
  },
};
