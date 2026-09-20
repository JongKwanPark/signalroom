// bioRxiv + medRxiv recent postings via api.biorxiv.org/details/{server}.
// Abstracts are publisher-copyright -> metadata only (no abstract excerpt).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface Detail {
  title?: string;
  doi?: string;
  date?: string;
  authors?: string;
  category?: string;
}

function buildCollector(server: "biorxiv" | "medrxiv"): Collector {
  return {
    meta: {
      name: server,
      verticals: ["bio"],
      licenseNote: "bXiv API metadata; abstracts publisher-copyright -> own summaries only",
      requiresKey: false,
    },
    async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
      const url = `https://api.biorxiv.org/details/${server}/${ctx.date}/${ctx.date}/0`;
      const res = await fetchJson<{ collection?: Detail[] }>({ url, timeoutMs: 20_000 });
      if (!res.ok) throw new Error(`${server}: ${res.error}`);
      const items: RawItem[] = (res.data?.collection ?? [])
        .slice(0, Math.min(ctx.limit, 50))
        .filter((d): d is Detail & { title: string; doi: string } => Boolean(d.title && d.doi))
        .map((d) => ({
          source: server,
          vertical: "bio" as const,
          title: d.title.replace(/\s+/g, " ").trim(),
          url: `https://doi.org/${d.doi}`,
          publishedAt: d.date ?? `${ctx.date}T00:00:00Z`,
          author: d.authors?.split(";")[0]?.trim(),
          licenseNote: "bXiv metadata; abstracts publisher-copyright",
        }));
      return { items };
    },
  };
}

export const biorxiv: Collector = buildCollector("biorxiv");
export const medrxiv: Collector = buildCollector("medrxiv");
