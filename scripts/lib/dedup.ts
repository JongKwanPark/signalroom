// URL normalization, hashing, title simhash + hamming distance, and
// duplicate merging for collected items.
import { createHash } from "node:crypto";

const STRIP_PARAMS = /^(utm_|fbclid|gclid|mc_|ref|amp)$/i;
const PARAM_PREFIX = /^(utm_|fbclid|gclid|mc_)/i;

// Canonicalize a URL: https, lowercase host, drop www., strip
// utm_*/fbclid/gclid/amp tracking params, fragment, trailing slash.
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim();
  }
  url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    if (STRIP_PARAMS.test(key) || PARAM_PREFIX.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname
    .split("/")
    .filter((seg) => seg && !/^amp$/i.test(seg))
    .join("/");
  let out = url.toString();
  out = out.replace(/\?$/, "").replace(/\/+$/, "");
  return out;
}

export function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export function urlHash(url: string): string {
  return sha1(normalizeUrl(url));
}

// 64-bit simhash over whitespace tokens (word features, frequency-weighted,
// token fingerprint = first 64 bits of sha1).
export function simhash64(text: string): bigint {
  const tokens = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return 0n;

  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const v = new Array<bigint>(64).fill(0n);
  for (const [token, weight] of freq) {
    const digest = createHash("sha1").update(token).digest();
    let fp = 0n;
    for (let i = 0; i < 8; i++) fp = (fp << 8n) | BigInt(digest[i]);
    for (let bit = 0; bit < 64; bit++) {
      if ((fp >> BigInt(bit)) & 1n) v[bit] += BigInt(weight);
      else v[bit] -= BigInt(weight);
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (v[bit] > 0n) out |= 1n << BigInt(bit);
  }
  return out;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

export interface DedupItem {
  url: string;
  title: string;
  publishedAt?: string;
  engagement?: number;
}

// Dedup by exact URL hash first, then near-duplicate titles (simhash64 with
// hamming distance <= threshold, default 3) in the same pass. When items
// merge, the primary keeps the stronger item (earlier publishedAt, higher
// engagement); merged counts fold into the winner.
export function mergeDuplicates<T extends DedupItem>(
  items: T[],
  threshold = 3
): { kept: T[]; mergedCount: number } {
  const byUrl = new Map<string, T>();
  for (const item of items) {
    const hash = urlHash(item.url);
    const existing = byUrl.get(hash);
    byUrl.set(hash, existing ? stronger(existing, item) : item);
  }
  const urlMerged = items.length - byUrl.size;

  const pool = [...byUrl.values()];
  type Entry = { item: T; sig: bigint; merged: number };
  const keptEntries: Entry[] = [];
  let titleMerged = 0;

  for (let i = 0; i < pool.length; i++) {
    const sig = simhash64(pool[i].title ?? "");
    const match = keptEntries.find((e) => hammingDistance(e.sig, sig) <= threshold);
    if (match) {
      match.item = stronger(match.item, pool[i]);
      match.merged += 1;
      match.sig = simhash64(match.item.title ?? "");
      titleMerged += 1;
    } else {
      keptEntries.push({ item: pool[i], sig, merged: 0 });
    }
  }

  const kept = keptEntries.map((e) => {
    const { item, merged } = e;
    if (merged > 0) (item as unknown as { _merged?: number })._merged = merged;
    return item;
  });

  return { kept, mergedCount: urlMerged + titleMerged };
}

function rank<T extends DedupItem>(x: T): number {
  const meta = x as unknown as { excerpt?: unknown };
  const hasExcerpt = typeof meta.excerpt === "string" && meta.excerpt.length > 0 ? 1 : 0;
  return (x.engagement ?? 0) + hasExcerpt * 1000 - (x.title ? 0 : 10000);
}

function stronger<T extends DedupItem>(a: T, b: T): T {
  return rank(b) > rank(a) ? b : a;
}
