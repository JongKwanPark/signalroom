// GitHub trending/new AI repos via api.github.com/search/repositories.
// Optional GITHUB_TOKEN raises rate limits (60 -> 5000 req/hr).
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { truncateExcerpt } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

export const github: Collector = {
  meta: {
    name: "github",
    verticals: ["ai"],
    licenseNote: "GitHub API ToS: metadata OK, repo contents remain under their licenses",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const url =
      "https://api.github.com/search/repositories?" +
      new URLSearchParams({
        q: `topic:llm created:>${since}`,
        sort: "stars",
        order: "desc",
        per_page: String(Math.min(ctx.limit, 30)),
      });
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetchJson<{ items?: GhRepo[] }>({ url, headers, timeoutMs: 15_000 });
    if (!res.ok) throw new Error(`github: ${res.error}`);
    const items: RawItem[] = (res.data?.items ?? []).map((r) => ({
      source: "github",
      vertical: "ai",
      title: `${r.full_name}: ${r.description?.slice(0, 200) ?? "new repository"}`,
      url: r.html_url ?? `https://github.com/${r.full_name}`,
      publishedAt: r.created_at ?? new Date().toISOString(),
      author: r.owner?.login,
      engagement: r.stargazers_count ?? 0,
      excerpt: truncateExcerpt(r.description ?? "", 400) || undefined,
      licenseNote: "GitHub API metadata; repo contents under their own licenses",
    }));
    return { items };
  },
};

interface GhRepo {
  full_name: string;
  html_url?: string;
  description?: string;
  created_at?: string;
  stargazers_count?: number;
  owner?: { login?: string };
}
