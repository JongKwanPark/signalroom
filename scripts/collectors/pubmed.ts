// PubMed via NCBI E-utilities: esearch (recent) + esummary (details).
// Free; abstracts are publisher-copyright -> metadata only.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface ESearch {
  esearchresult?: { idlist?: string[] };
}
interface ESummary {
  result?: Record<string, { title?: string; sortpubdate?: string; epubdate?: string; source?: string; lastauthor?: string }>;
}

export const pubmed: Collector = {
  meta: {
    name: "pubmed",
    verticals: ["bio"],
    licenseNote: "E-utilities open; abstract copyright publishers -> own summaries only",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const term = `(artificial intelligence[Title/Abstract] OR machine learning[Title/Abstract]) AND ("last 7 days"[PDAT])`;
    const searchUrl =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" +
      new URLSearchParams({ db: "pubmed", retmode: "json", retmax: String(Math.min(ctx.limit, 50)), term });
    const search = await fetchJson<ESearch>({ url: searchUrl, timeoutMs: 20_000 });
    if (!search.ok) throw new Error(`pubmed esearch: ${search.error}`);
    const ids = search.data?.esearchresult?.idlist ?? [];
    if (ids.length === 0) return { items: [] };

    const sumUrl =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" +
      new URLSearchParams({ db: "pubmed", retmode: "json", id: ids.join(",") });
    const sum = await fetchJson<ESummary>({ url: sumUrl, timeoutMs: 20_000 });
    if (!sum.ok) throw new Error(`pubmed esummary: ${sum.error}`);

    const docs = sum.data?.result ?? {};
    const items: RawItem[] = [];
    for (const id of ids) {
      const doc = docs[id];
      if (!doc?.title) continue;
      items.push({
        source: "pubmed",
        vertical: "bio",
        title: doc.title.replace(/\.$/, ""),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        publishedAt: doc.sortpubdate ?? doc.epubdate ?? new Date().toISOString(),
        author: doc.lastauthor,
        licenseNote: "PubMed metadata; abstracts publisher-copyright",
      });
    }
    return { items };
  },
};
