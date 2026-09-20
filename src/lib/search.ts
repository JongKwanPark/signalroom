import type { StoryRef } from './editions';

export interface SearchItem {
  url: string;
  headline: string;
  dek?: string;
  vertical: string;
  date: string;
  type: string;
  readMinutes: number;
  sources: number;
  cluster: number;
  tags: string[];
  tldr: string[];
}

export function buildSearchItem(ref: StoryRef): SearchItem {
  return {
    url: ref.href,
    headline: ref.story.headline,
    dek: ref.story.dek,
    vertical: ref.vertical,
    date: ref.date,
    type: ref.story.type,
    readMinutes: ref.story.readMinutes,
    sources: ref.story.sources.length,
    cluster: ref.story.cluster.length,
    tags: ref.story.tags,
    tldr: ref.story.tldr,
  };
}

export function buildSearchIndex(refs: StoryRef[]): SearchItem[] {
  return refs.map(buildSearchItem);
}

export function scoreItem(item: SearchItem, query: string): number {
  if (query.length === 0) return 0;
  const q = query.toLowerCase();
  const headline = item.headline.toLowerCase();
  let score = 0;

  if (headline.startsWith(q)) score += 100;
  else if (headline.includes(q)) score += 60;

  if (item.vertical.toLowerCase() === q) score += 50;
  if (item.type.toLowerCase() === q) score += 30;
  if (item.date.includes(q)) score += 40;

  for (const tag of item.tags) {
    const normalized = tag.toLowerCase();
    if (normalized === q) score += 45;
    else if (normalized.includes(q)) score += 20;
  }

  if (item.dek?.toLowerCase().includes(q)) score += 15;
  if (item.tldr.some((line) => line.toLowerCase().includes(q))) score += 10;

  if (score === 0 && headline.includes(q)) score += 1;
  return score;
}

export function searchIndex(items: SearchItem[], query: string, limit: number): SearchItem[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .map((item) => ({
      item,
      score: words.reduce((total, word) => total + scoreItem(item, word), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .slice(0, limit)
    .map((entry) => entry.item);
}
