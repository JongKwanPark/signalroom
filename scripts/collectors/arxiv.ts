// arXiv via export.arxiv.org API. 3s spacing required by arXiv guidelines.
// Abstracts are publisher-copyright -> store metadata + short link only,
// no abstract text in excerpts beyond title.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchWithRetry } from "../lib/fetch.ts";

const CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"];

export const arxiv: Collector = {
  meta: {
    name: "arxiv",
    verticals: ["ai"],
    licenseNote: "arXiv metadata open; abstracts publisher-copyright -> own summaries only",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const cats = CATEGORIES.map((c) => `cat:${c}`).join(" OR ");
    const url =
      "https://export.arxiv.org/api/query?" +
      new URLSearchParams({
        search_query: `(${cats})`,
        sortBy: "submittedDate",
        sortOrder: "descending",
        start: "0",
        max_results: String(Math.min(ctx.limit, 50)),
      });
    const res = await fetchWithRetry({ url, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`arxiv: ${res.error}`);

    const items: RawItem[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(res.text)) !== null) {
      const block = m[1];
      const title = pick(block, /<title>([\s\S]*?)<\/title>/);
      const id = pick(block, /<id>([\s\S]*?)<\/id>/) ?? "";
      const published = pick(block, /<published>([\s\S]*?)<\/published>/);
      const author = pick(block, /<name>([\s\S]*?)<\/name>/);
      if (!title || !id) continue;
      items.push({
        source: "arxiv",
        vertical: "ai",
        title: collapse(title),
        url: id,
        publishedAt: published ?? new Date().toISOString(),
        author,
        // Publisher-copyright: headline + link only, no abstract excerpt.
        licenseNote: "arXiv metadata open; abstract copyright of publishers/authors",
      });
    }
    return { items };
  },
};

function pick(block: string, re: RegExp): string | undefined {
  const m = block.match(re);
  return m ? collapse(m[1]) : undefined;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
