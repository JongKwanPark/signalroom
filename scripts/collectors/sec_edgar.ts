// SEC EDGAR: full-text search (efts.sec.gov) + browse-edgar atom for recent
// filings. REQUIRES SEC_EDGAR_USER_AGENT ("Name email@example.com") or 403.
// EDGAR data is public domain.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson, fetchWithRetry, parseFeed } from "../lib/fetch.ts";

interface Hit {
  _id?: string; // e.g. "0001018724-26-000004:press.htm"
  _source?: { display_names?: string[]; file_date?: string; ciks?: string[]; adsh?: string };
}

export const sec_edgar: Collector = {
  meta: {
    name: "sec_edgar",
    verticals: ["markets"],
    licenseNote: "SEC EDGAR filings are public domain (17 U.S.C. sec. 105)",
    requiresKey: true,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const ua = process.env.SEC_EDGAR_USER_AGENT;
    if (!ua) {
      ctx.log("sec_edgar skipped: SEC_EDGAR_USER_AGENT unset (would get 403)");
      return { items: [] };
    }
    const headers = { "User-Agent": ua, Accept: "application/json" };
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const ftsUrl =
      "https://efts.sec.gov/LATEST/search-index?" +
      new URLSearchParams({
        q: '"artificial intelligence"',
        dateRange: "custom",
        startdt: since,
        enddt: ctx.date,
        forms: "8-K,10-K,10-Q",
      });
    const fts = await fetchJson<{ hits?: { hits?: Hit[] } }>({ url: ftsUrl, headers, timeoutMs: 20_000 });

    let items: RawItem[] = [];
    if (fts.ok) {
      items = (fts.data?.hits?.hits ?? []).slice(0, Math.min(ctx.limit, 40)).map((h) => {
        const company = h._source?.display_names?.[0] ?? "Unknown filer";
        const adsh = h._source?.adsh ?? h._id?.split(":")[0] ?? "";
        const cik = h._source?.ciks?.[0] ?? "";
        const accession = adsh.replace(/-/g, "");
        return {
          source: "sec_edgar",
          vertical: "markets" as const,
          title: `SEC filing: ${company} (${h._id?.split(":")[1]?.toUpperCase() ?? "filing"})`,
          url: adsh && cik
            ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/`
            : "https://efts.sec.gov/LATEST/search-index",
          publishedAt: h._source?.file_date ? `${h._source.file_date}T00:00:00Z` : new Date().toISOString(),
          excerpt: truncateExcerpt(company, 400) || undefined,
          licenseNote: "SEC EDGAR public domain",
        };
      });
    }

    // Fallback/complement: browse-edgar atom of latest filings.
    const atom = await fetchWithRetry({
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001067983&type=8-K&dateb=&owner=include&count=10&output=atom",
      headers: { "User-Agent": ua },
      timeoutMs: 15_000,
      retries: 2,
    });
    if (atom.ok) {
      const extra = parseFeed(atom.text).slice(0, 10).map((it) => ({
        source: "sec_edgar",
        vertical: "markets" as const,
        title: it.title,
        url: it.link,
        publishedAt: isoDate(it.publishedAt),
        licenseNote: "SEC EDGAR public domain",
      }));
      items = items.concat(extra);
    }

    if (!fts.ok && items.length === 0) {
      throw new Error(`sec_edgar full-text search: ${fts.error ?? "no results"}`);
    }
    return { items };
  },
};

function isoDate(input: string): string {
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
