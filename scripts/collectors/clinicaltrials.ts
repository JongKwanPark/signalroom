// ClinicalTrials.gov API v2: recently posted/updated studies.
import type { Collector, CollectContext, RawItem } from "../lib/types.ts";
import { fetchJson } from "../lib/fetch.ts";

interface Study {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { lastUpdatePostDateStruct?: { date?: string } };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
  };
}

export const clinicaltrials: Collector = {
  meta: {
    name: "clinicaltrials",
    verticals: ["bio"],
    licenseNote: "ClinicalTrials.gov data public domain (NIH)",
    requiresKey: false,
  },
  async collect(ctx: CollectContext): Promise<{ items: RawItem[] }> {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const pageSize = String(Math.min(ctx.limit, 50));
    const fields = "NCTId,BriefTitle,LastUpdatePostDate,LeadSponsorName";
    const dateFilter = `AREA[LastUpdatePostDate]RANGE[${since},MAX]`;
    const [therapeutics, general] = await Promise.all([
      fetchStudies({
        "query.intr":
          'CAR-T OR "chimeric antigen receptor" OR "N-acetylcysteine" OR "nicotinamide riboside" OR "nicotinamide mononucleotide" OR rusfertide',
        "filter.advanced": dateFilter,
        pageSize,
        fields,
      }),
      fetchStudies({ "filter.advanced": dateFilter, pageSize, fields }),
    ]);
    const items: RawItem[] = [];
    const seen = new Set<string>();
    for (const item of [...therapeutics, ...general]) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
      if (items.length >= ctx.limit) break;
    }
    return { items };
  },
};

async function fetchStudies(params: Record<string, string>): Promise<RawItem[]> {
  const url = "https://clinicaltrials.gov/api/v2/studies?" + new URLSearchParams(params);
  const res = await fetchJson<{ studies?: Study[] }>({ url, timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`clinicaltrials: ${res.error}`);
  return (res.data?.studies ?? [])
    .map((s) => s.protocolSection)
    .filter(
      (p): p is { identificationModule: { nctId: string; briefTitle: string }; statusModule?: { lastUpdatePostDateStruct?: { date?: string } }; sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } } } =>
        Boolean(p?.identificationModule?.nctId && p?.identificationModule?.briefTitle)
    )
    .map((p) => ({
      source: "clinicaltrials",
      vertical: "bio" as const,
      title: p.identificationModule.briefTitle.trim(),
      url: `https://clinicaltrials.gov/study/${p.identificationModule.nctId}`,
      publishedAt: isoDate(p.statusModule?.lastUpdatePostDateStruct?.date),
      author: p.sponsorCollaboratorsModule?.leadSponsor?.name,
      licenseNote: "ClinicalTrials.gov public domain (NIH)",
    }));
}

function isoDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
