// GDELT DOC 2.0 article list via api.gdeltproject.org (attribution required).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface Article {
  url?: string;
  title?: string;
  seendate?: string; // 20260920T120000Z
  domain?: string;
}

export const gdelt: Collector = {
  meta: {
    name: "gdelt",
    verticals: ["geo"],
    licenseNote: "GDELT requires attribution: 'GDELT Project' linked in every use",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc?" +
      new URLSearchParams({
        query: "(conflict OR sanctions OR ceasefire OR humanitarian) sourcelang:eng",
        mode: "artlist",
        maxrecords: String(Math.min(ctx.limit, 75)),
        format: "json",
        timespan: "1d",
      });
    const res = await fetchJson<{ articles?: Article[] }>({ url, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`gdelt: ${res.error}`);
    const items: RawItem[] = (res.data?.articles ?? [])
      .filter((a): a is { url: string; title: string; seendate?: string; domain?: string } => Boolean(a.url && a.title))
      .map((a) => ({
        source: "gdelt",
        vertical: "geo" as const,
        title: a.title.replace(/\s+/g, " ").trim(),
        url: a.url,
        publishedAt: seenToIso(a.seendate),
        excerpt: a.domain ? `Source domain: ${a.domain}` : undefined,
        licenseNote: "GDELT Project data, attribution required",
      }));
    return { items };
  },
};

function seenToIso(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}
