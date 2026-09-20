// FRED (St. Louis Fed) series updates. Optional FRED_API_KEY; without a key
// the collector returns no items (FRED requires a key for API access).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

export const fred: Collector = {
  meta: {
    name: "fred",
    verticals: ["markets"],
    licenseNote: "FRED data: most series are U.S. government public domain; some third-party",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const key = process.env.FRED_API_KEY;
    if (!key) {
      ctx.log("fred skipped: FRED_API_KEY unset (optional)");
      return { items: [] };
    }
    const url =
      "https://api.stlouisfed.org/fred/series/updates?" +
      new URLSearchParams({
        api_key: key,
        file_type: "json",
        limit: String(Math.min(ctx.limit, 50)),
        sort_order: "desc",
      });
    const res = await fetchJson<{ seriess?: Array<{ series_id?: string; last_updated?: string; title?: string }> }>({
      url,
      timeoutMs: 20_000,
    });
    if (!res.ok) throw new Error(`fred: ${res.error}`);
    const items: RawItem[] = (res.data?.seriess ?? [])
      .filter((s) => s.series_id)
      .map((s) => ({
        source: "fred",
        vertical: "markets" as const,
        title: `FRED series update: ${s.title ?? s.series_id} (${s.series_id})`,
        url: `https://fred.stlouisfed.org/series/${s.series_id}`,
        publishedAt: s.last_updated ?? new Date().toISOString(),
        licenseNote: "FRED; U.S. government series public domain",
      }));
    return { items };
  },
};
