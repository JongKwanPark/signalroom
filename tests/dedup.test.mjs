// Tests for scripts/lib/dedup.ts (run by `node --test`; Node 24 type
// stripping loads the .ts modules directly).
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, urlHash, sha1, simhash64, hammingDistance, mergeDuplicates } from "../scripts/lib/dedup.ts";

test("normalizeUrl strips utm/fbclid/gclid params, fragment, trailing slash", () => {
  const input = "https://example.com/path/to/story/?utm_source=x&utm_medium=rss&fbclid=abc123&gclid=xyz#section";
  const out = normalizeUrl(input);
  assert.equal(out, "https://example.com/path/to/story");
});

test("normalizeUrl removes www and /amp/ segment and ?amp", () => {
  assert.equal(normalizeUrl("https://www.example.com/amp/story"), "https://example.com/story");
  assert.equal(normalizeUrl("https://example.com/story?amp=1"), "https://example.com/story");
});

test("normalizeUrl keeps real query params", () => {
  assert.equal(normalizeUrl("https://example.com/story?id=42"), "https://example.com/story?id=42");
});

test("normalizeUrl handles root without trailing slash removal of nothing", () => {
  assert.equal(normalizeUrl("https://example.com/"), "https://example.com");
});

test("urlHash is stable across equivalent urls and differs across distinct urls", () => {
  const a = urlHash("https://www.Example.com/story?utm_source=feed#top");
  const b = urlHash("https://example.com/story");
  assert.equal(a, b);
  assert.notEqual(urlHash("https://example.com/story"), urlHash("https://example.com/other"));
  assert.equal(urlHash("https://example.com/x"), sha1(normalizeUrl("https://example.com/x")));
});

test("simhash64: identical titles -> identical hash, hamming 0", () => {
  const h1 = simhash64("OpenAI releases new open weight model with strong benchmarks");
  const h2 = simhash64("OpenAI releases new open weight model with strong benchmarks");
  assert.equal(hammingDistance(h1, h2), 0);
});

test("simhash64: similar titles within threshold, distinct titles far apart", () => {
  const a = simhash64("FDA approves first CRISPR therapy for rare blood disorder");
  const b = simhash64("FDA approves first CRISPR therapy for a rare blood disorder");
  assert.ok(hammingDistance(a, b) <= 3, `expected <=3, got ${hammingDistance(a, b)}`);
  const c = simhash64("Bitcoin rallies past 100k as ETF inflows accelerate");
  assert.ok(hammingDistance(a, c) > 3, `expected >3, got ${hammingDistance(a, c)}`);
});

test("hammingDistance counts differing bits", () => {
  assert.equal(hammingDistance(0b1010n, 0b0110n), 2);
  assert.equal(hammingDistance(0n, 0xffffffffffffffffn), 64);
});

test("mergeDuplicates removes exact URL duplicates", () => {
  const items = [
    { url: "https://example.com/a?utm_source=x", title: "Alpha story" },
    { url: "https://example.com/a", title: "Alpha story again" },
    { url: "https://example.com/b", title: "Beta story" },
  ];
  const { kept, mergedCount } = mergeDuplicates(items);
  assert.equal(kept.length, 2);
  assert.equal(mergedCount, 1);
});

test("mergeDuplicates merges near-duplicate titles", () => {
  const items = [
    { url: "https://a.example.com/story", title: "FDA approves first CRISPR therapy for rare blood disorder" },
    { url: "https://b.example.com/story", title: "FDA approves first CRISPR therapy for a rare blood disorder" },
  ];
  const { kept, mergedCount } = mergeDuplicates(items);
  assert.equal(kept.length, 1);
  assert.equal(mergedCount, 1);
  assert.ok((kept[0])._merged === 1);
});

test("mergeDuplicates keeps distinct stories untouched", () => {
  const items = [
    { url: "https://a.example.com/1", title: "Fed cuts rates by 25 basis points in surprise move" },
    { url: "https://b.example.com/2", title: "Novartis reports positive phase III oncology trial results" },
  ];
  const { kept, mergedCount } = mergeDuplicates(items);
  assert.equal(kept.length, 2);
  assert.equal(mergedCount, 0);
});
