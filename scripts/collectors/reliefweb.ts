// ReliefWeb humanitarian reports via api.reliefweb.int.
// Requires a pre-approved RELIEFWEB_APPNAME; skipped if unset.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface ReliefDoc {
  id?: string;
  fields?: {
    title?: string;
    url?: string;
    url_alias_alias?: string;
    date?: { created?: string };
    source?: { shortname?: string };
    body_html?: string;
  };
}

export const reliefweb: Collector = {
  meta: {
    name: "reliefweb",
    verticals: ["geo"],
    licenseNote: "ReliefWeb content reuse varies by source; metadata OK with attribution",
    requiresKey: true,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const appname = process.env.RELIEFWEB_APPNAME;
    if (!appname) {
      ctx.log("reliefweb skipped: RELIEFWEB_APPNAME unset");
      return { items: [] };
    }
    const url =
      "https://api.reliefweb.int/v1/reports?" +
      new URLSearchParams({
        appname,
        limit: String(Math.min(ctx.limit, 50)),
        sort: "date:desc",
        fields: "include[]=title&include[]=url_alias_alias&include[]=date.created&include[]=source.shortname&include[]=id",
      });
    const res = await fetchJson<{ data?: ReliefDoc[] }>({ url, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`reliefweb: ${res.error}`);
    const items: RawItem[] = (res.data?.data ?? [])
      .map((d) => d.fields)
      .filter((f): f is NonNullable<ReliefDoc["fields"]> & { title: string; url_alias_alias: string } =>
        Boolean(f?.title && f?.url_alias_alias))
      .map((f) => ({
        source: "reliefweb",
        vertical: "geo" as const,
        title: f.title.replace(/\s+/g, " ").trim(),
        url: f.url_alias_alias.startsWith("http") ? f.url_alias_alias : `https://reliefweb.int${f.url_alias_alias}`,
        publishedAt: f.date?.created ?? new Date().toISOString(),
        author: f.source?.shortname,
        excerpt: f.body_html ? truncateExcerpt(f.body_html.replace(/<[^>]+>/g, " "), 400) : undefined,
        licenseNote: "ReliefWeb; individual sources may carry their own terms",
      }));
    return { items };
  },
};
