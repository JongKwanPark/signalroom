// openFDA drug label records via api.fda.gov/drug/label.json (free, no key
// required for low volume).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface LabelRecord {
  openfda?: { brand_name?: string[]; manufacturer_name?: string[] };
  effective_time?: string[];
  indications_and_usage?: string[];
  id?: string;
}

export const openfda: Collector = {
  meta: {
    name: "openfda",
    verticals: ["bio"],
    licenseNote: "openFDA public data; derived from FDA labeling (public domain source)",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const url =
      "https://api.fda.gov/drug/label.json?" +
      new URLSearchParams({
        search: "effective_time:[" + windowStart() + " TO " + ctx.date.replace(/-/g, "") + "]",
        sort: "effective_time:desc",
        limit: String(Math.min(ctx.limit, 50)),
      });
    const res = await fetchJson<{ results?: LabelRecord[] }>({ url, timeoutMs: 20_000 });
    if (!res.ok) {
      // openFDA returns 404 for zero results; treat as empty, not failure.
      if (res.status === 404) return { items: [] };
      throw new Error(`openfda: ${res.error}`);
    }
    const items: RawItem[] = (res.data?.results ?? [])
      .filter((r) => r.openfda?.brand_name?.length || r.id)
      .map((r) => {
        const brand = r.openfda?.brand_name?.[0] ?? "Unknown drug";
        const manufacturer = r.openfda?.manufacturer_name?.[0];
        const indication = truncateExcerpt(r.indications_and_usage?.[0] ?? "", 400);
        return {
          source: "openfda",
          vertical: "bio" as const,
          title: `FDA label update: ${brand}${manufacturer ? ` (${manufacturer})` : ""}`,
          url: `https://open.fda.gov/data/sources/`,
          publishedAt: isoDate(r.effective_time?.[0]),
          excerpt: indication || undefined,
          licenseNote: "openFDA public data; FDA labeling public domain",
        };
      });
    return { items };
  },
};

function windowStart(): string {
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

function isoDate(raw: string | undefined): string {
  if (raw && /^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`;
  }
  return new Date().toISOString();
}
