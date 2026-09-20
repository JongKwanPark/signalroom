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
    const url =
      "https://clinicaltrials.gov/api/v2/studies?" +
      new URLSearchParams({
        "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${since},MAX]`,
        pageSize: String(Math.min(ctx.limit, 50)),
        fields: "NCTId,BriefTitle,LastUpdatePostDate,LeadSponsorName",
      });
    const res = await fetchJson<{ studies?: Study[] }>({ url, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`clinicaltrials: ${res.error}`);
    const items: RawItem[] = (res.data?.studies ?? [])
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
    return { items };
  },
};

function isoDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
