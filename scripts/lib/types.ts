// Shared pipeline types.

export type Vertical = "ai" | "bio" | "geo" | "markets";

export const VERTICALS: Vertical[] = ["ai", "bio", "geo", "markets"];

export interface RawItem {
  source: string;
  vertical: Vertical;
  title: string;
  url: string;
  publishedAt: string;
  author?: string;
  excerpt?: string; // <= 400 chars, never full article text
  engagement?: number; // points/comments/stars normalized to a number
  licenseNote?: string;
}

export type SourceStatus = "ok" | "empty" | "failed";

export interface SourceHealth {
  name: string;
  status: SourceStatus;
  count: number;
  error?: string;
}

export interface CollectorMeta {
  name: string;
  verticals: Vertical[];
  licenseNote: string;
  requiresKey: boolean;
}

export interface CollectContext {
  date: string; // YYYY-MM-DD
  vertical: Vertical;
  limit: number;
  dryRun: boolean;
  log: (msg: string) => void;
}

export interface CollectorResult {
  items: RawItem[];
  error?: string;
}

export interface Collector {
  meta: CollectorMeta;
  collect: (ctx: CollectContext) => Promise<CollectorResult>;
}

export function truncateExcerpt(text: string, max = 400): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "\u2026";
}
