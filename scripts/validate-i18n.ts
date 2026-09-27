// Translation-only validation for bilingual stage 1 (plan-bilingual §4-1, 1-4).
// Complements scripts/validate.ts WITHOUT modifying it: import its schema/publish
// gates, then add i18n checks (language detection, mixed-sentence detection,
// citation-id parity en↔ko, slug rules). Node built-ins only.
//
// Usage:
//   npx tsx scripts/validate-i18n.ts <ko-edition.json> [--en <en-edition.json>]
// Exit non-zero on any violation. Functions are exported so a caller can build
// an en→ko draft test (en edition -> ko draft -> expect failures detected).
import { readFile } from "node:fs/promises";
import { validateEditionData } from "./validate.ts";

export interface Violation {
  path: string;
  message: string;
}

interface StoryLike {
  slug?: unknown;
  headline?: unknown;
  dek?: unknown;
  tldr?: unknown;
  body?: unknown;
  whyItMatters?: unknown;
  editorNote?: unknown;
  cluster?: unknown;
  sources?: unknown;
}

interface EditionLike {
  title?: unknown;
  summary?: unknown;
  stories?: unknown;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HANGUL_RE = /[\uAC00-\uD7A3]/g;
const HANGUL_CHAR = /[\uAC00-\uD7A3]/;
const LATIN_WORD = /[A-Za-z]{2,}/g;

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** Count Hangul syllables in text. */
export function countHangul(text: string): number {
  return text.match(HANGUL_RE)?.length ?? 0;
}

/** Count Latin words (len ≥ 2) in text. */
export function countLatinWords(text: string): number {
  return text.match(LATIN_WORD)?.length ?? 0;
}

/**
 * Translatable text of a story: headline, dek, tldr, body texts,
 * whyItMatters. (editorNote excluded: it may carry TODO-glossary markers in
 * either language during stage 1.)
 */
export function collectTranslatableText(story: StoryLike): string[] {
  const out: string[] = [];
  if (isStr(story.headline)) out.push(story.headline);
  if (isStr(story.dek)) out.push(story.dek);
  if (Array.isArray(story.tldr)) for (const t of story.tldr) if (isStr(t)) out.push(t);
  if (Array.isArray(story.body)) {
    for (const b of story.body) {
      const r = asRecord(b);
      if (r && isStr(r.text)) out.push(r.text);
    }
  }
  if (isStr(story.whyItMatters)) out.push(story.whyItMatters);
  return out;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?!。！？])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * 1-4a: Korean presence — every translatable field group of a ko story must
 * contain Hangul. Whole-field English residue fails.
 */
export function checkKoreanPresence(ko: EditionLike, out: Violation[]): void {
  const stories = Array.isArray(ko.stories) ? ko.stories : [];
  if (isStr(ko.title) && countHangul(ko.title) === 0) {
    out.push({ path: "title", message: "i18n: ko edition title has no Hangul (untranslated?)" });
  }
  if (isStr(ko.summary) && countHangul(ko.summary) === 0) {
    out.push({ path: "summary", message: "i18n: ko edition summary has no Hangul (untranslated?)" });
  }
  stories.forEach((st, idx) => {
    const s = asRecord(st) ?? {};
    for (const text of collectTranslatableText(s as StoryLike)) {
      if (countHangul(text) === 0 && countLatinWords(text) >= 3) {
        const slug = isStr(s.slug) ? ` (${s.slug})` : "";
        out.push({
          path: `stories[${idx}]`,
          message: `i18n: English residue in ko story${slug}: ${JSON.stringify(text.slice(0, 80))}`,
        });
        break; // one flag per story is enough to block publish
      }
    }
  });
}

/**
 * 1-4b: mixed-sentence detection (heuristic, stage-1 level).
 * A sentence is "mixed" when it carries substantial Korean (≥10 Hangul chars)
 * AND a long uninterrupted Latin run (≥5 consecutive Latin words) — i.e. an
 * English clause pasted into a Korean sentence. Short verbatim insertions
 * (names, figures) do not trigger it. TODO: refine thresholds once ko samples
 * accumulate; tune via --strict-mixed (lowers Latin-run threshold to 3).
 */
export function checkMixedSentences(ko: EditionLike, out: Violation[], strictMixed = false): void {
  const runThreshold = strictMixed ? 3 : 5;
  const runRe = new RegExp(`(?:[A-Za-z]{2,}[\\s,;:'"()\\-–—]+){${runThreshold},}`, "g");
  const stories = Array.isArray(ko.stories) ? ko.stories : [];
  stories.forEach((st, idx) => {
    const s = asRecord(st) ?? {};
    const slug = isStr(s.slug) ? ` (${s.slug})` : "";
    for (const text of collectTranslatableText(s as StoryLike)) {
      for (const sent of splitSentences(text)) {
        if (countHangul(sent) >= 10 && runRe.test(sent)) {
          out.push({
            path: `stories[${idx}]`,
            message: `i18n: mixed-language sentence in ko story${slug}: ${JSON.stringify(sent.slice(0, 100))}`,
          });
          runRe.lastIndex = 0;
          return; // one flag per story
        }
        runRe.lastIndex = 0;
      }
      void HANGUL_CHAR;
    }
  });
}

/** Strip the stage-1 ko suffix: "<base>-ko" -> "<base>". */
export function koBaseSlug(slug: string): string {
  return slug.endsWith("-ko") ? slug.slice(0, -3) : slug;
}

function idSet(sources: unknown): Set<number> {
  const ids = new Set<number>();
  if (!Array.isArray(sources)) return ids;
  for (const c of sources) {
    const r = asRecord(c);
    if (r && Number.isInteger(r.id) && (r.id as number) > 0) ids.add(r.id as number);
  }
  return ids;
}

function urlSet(links: unknown): Set<string> {
  const urls = new Set<string>();
  if (!Array.isArray(links)) return urls;
  for (const l of links) {
    const r = asRecord(l);
    if (r && isStr(r.url)) urls.add(r.url);
  }
  return urls;
}

function bodyCitationIds(body: unknown): number[] {
  const ids: number[] = [];
  if (!Array.isArray(body)) return ids;
  for (const b of body) {
    const r = asRecord(b);
    if (r && Array.isArray(r.citations)) for (const c of r.citations) if (Number.isInteger(c)) ids.push(c as number);
  }
  return ids;
}

/**
 * 1-4c: citation-id parity en↔ko. Stories pair by slug base
 * (ko "<base>-ko" ↔ en "<base>"). Checks: sources id sets equal, every ko
 * body citation resolves to ko sources AND matches the en citation multiset,
 * cluster url sets equal.
 */
export function checkCitationParity(en: EditionLike, ko: EditionLike, out: Violation[]): void {
  const enStories = Array.isArray(en.stories) ? en.stories : [];
  const koStories = Array.isArray(ko.stories) ? ko.stories : [];
  const enByBase = new Map<string, Record<string, unknown>>();
  for (const st of enStories) {
    const r = asRecord(st);
    if (r && isStr(r.slug)) enByBase.set(r.slug, r);
  }
  koStories.forEach((st, idx) => {
    const k = asRecord(st);
    if (!k || !isStr(k.slug)) return;
    const base = koBaseSlug(k.slug);
    const e = enByBase.get(base);
    if (!e) {
      out.push({ path: `stories[${idx}].slug`, message: `i18n: ko slug ${k.slug} has no en counterpart (${base})` });
      return;
    }
    const enIds = idSet(e.sources);
    const koIds = idSet(k.sources);
    const missing = [...enIds].filter((id) => !koIds.has(id));
    const extra = [...koIds].filter((id) => !enIds.has(id));
    if (missing.length > 0 || extra.length > 0) {
      out.push({
        path: `stories[${idx}].sources`,
        message: `i18n: citation id mismatch vs en (${base}): missing [${missing}] extra [${extra}]`,
      });
    }
    for (const cid of bodyCitationIds(k.body)) {
      if (!koIds.has(cid)) {
        out.push({ path: `stories[${idx}].body`, message: `i18n: ko citation ${cid} does not resolve to ko sources[]` });
        break;
      }
    }
    const enCitations = bodyCitationIds(e.body).sort((a, b) => a - b);
    const koCitations = bodyCitationIds(k.body).sort((a, b) => a - b);
    if (enCitations.length !== koCitations.length || enCitations.some((id, index) => id !== koCitations[index])) {
      out.push({
        path: `stories[${idx}].body`,
        message: `i18n: citation id counts differ vs en (${base})`,
      });
    }
    const enUrls = urlSet(e.cluster);
    const koUrls = urlSet(k.cluster);
    const urlMissing = [...enUrls].filter((u) => !koUrls.has(u));
    const urlExtra = [...koUrls].filter((u) => !enUrls.has(u));
    if (urlMissing.length > 0 || urlExtra.length > 0) {
      out.push({
        path: `stories[${idx}].cluster`,
        message: `i18n: cluster url mismatch vs en (${base}): missing ${urlMissing.length} extra ${urlExtra.length}`,
      });
    }
  });
}

/**
 * 1-4d: slug rules — ko slugs ASCII kebab + "-ko" suffix, unique within ko
 * file, and (when en is given) exactly one ko per en story, no bare reuse of
 * an en slug.
 */
export function checkSlugRules(ko: EditionLike, en: EditionLike | null, out: Violation[]): void {
  const koStories = Array.isArray(ko.stories) ? ko.stories : [];
  const seen = new Set<string>();
  const enSlugs = new Set<string>();
  if (en && Array.isArray(en.stories)) {
    for (const st of en.stories) {
      const r = asRecord(st);
      if (r && isStr(r.slug)) enSlugs.add(r.slug);
    }
  }
  koStories.forEach((st, idx) => {
    const r = asRecord(st);
    const slug = r && isStr(r.slug) ? r.slug : "";
    if (!SLUG_RE.test(slug)) {
      out.push({ path: `stories[${idx}].slug`, message: `i18n: invalid ko slug (ASCII kebab required): ${JSON.stringify(slug)}` });
      return;
    }
    if (!slug.endsWith("-ko")) {
      out.push({ path: `stories[${idx}].slug`, message: `i18n: ko slug must end with -ko: ${slug}` });
    }
    if (seen.has(slug)) {
      out.push({ path: `stories[${idx}].slug`, message: `i18n: duplicate ko slug within edition: ${slug}` });
    }
    seen.add(slug);
    if (enSlugs.has(slug)) {
      out.push({ path: `stories[${idx}].slug`, message: `i18n: ko slug reuses an en slug verbatim: ${slug}` });
    }
  });
  if (en) {
    for (const base of enSlugs) {
      if (!seen.has(`${base}-ko`)) {
        out.push({ path: "stories", message: `i18n: en story has no ko counterpart: ${base} (expected ${base}-ko)` });
      }
    }
  }
}

/** Full i18n check. koData: parsed ko edition; enData: parsed en edition or null. */
export function validateI18n(koData: unknown, enData: unknown = null, opts: { strictMixed?: boolean } = {}): Violation[] {
  const out: Violation[] = [];
  const ko = asRecord(koData) ?? {};
  const en = enData == null ? null : (asRecord(enData) ?? {});
  // Base schema gates still apply to the ko file (imported, not duplicated).
  for (const v of validateEditionData(koData)) out.push({ path: v.path, message: v.message });
  checkKoreanPresence(ko as EditionLike, out);
  checkMixedSentences(ko as EditionLike, out, opts.strictMixed ?? false);
  checkSlugRules(ko as EditionLike, en as unknown as EditionLike | null, out);
  if (en) checkCitationParity(en as EditionLike, ko as EditionLike, out);
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const koPath = args.find((a) => !a.startsWith("-"));
  const enFlag = args.indexOf("--en");
  const enPath = enFlag >= 0 ? args[enFlag + 1] : undefined;
  const strictMixed = args.includes("--strict-mixed");
  if (!koPath) {
    console.error("usage: validate-i18n.ts <ko-edition.json> [--en <en-edition.json>] [--strict-mixed]");
    process.exit(2);
  }
  const koData = JSON.parse(await readFile(koPath, "utf8")) as unknown;
  const enData = enPath ? ((JSON.parse(await readFile(enPath, "utf8")) as unknown)) : null;
  const violations = validateI18n(koData, enData, { strictMixed });
  if (violations.length === 0) {
    console.log(`PASS ${koPath}${enPath ? ` (parity vs ${enPath})` : ""}`);
  } else {
    console.log(`FAIL ${koPath}${enPath ? ` (parity vs ${enPath})` : ""}`);
    for (const v of violations) console.log(`     ${v.path}: ${v.message}`);
    console.log(`\n${violations.length} violation(s)`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith((process.argv[1] ?? "").split("/").pop() ?? "");
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("validate-i18n failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
