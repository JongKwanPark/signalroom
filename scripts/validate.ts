// Hand-rolled validation mirroring src/content.config.ts (Zod schema) PLUS
// publish gates. Exits non-zero on any violation. Usable as a module:
//   import { validateEditionFile, validateEditionData } from "./validate.ts";
// No new dependencies (node built-ins only).
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { CATEGORY_KEYS, isVertical } from "../src/lib/categories.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

// 2-1 A안(채택): 에디션 언어. B안(파일 분리)은 폐기 아님 — 판별을 파일명에
// 분산하지 않고 이 필드로 단일화한다. 미표기 시 validateEditionData가 실패한다.
// 파일명 운용 규약: `<vertical>.json` = en, `<vertical>.ko.json` = ko.
export type Lang = "ko" | "en";

export function isLang(v: unknown): v is Lang {
  return v === "ko" || v === "en";
}

/** 파일명 → 기대 언어. `<vertical>.ko.json` = ko, 그 외 `.json` = en. */
export function inferLangFromFilename(file: string): Lang {
  return file.endsWith(".ko.json") ? "ko" : "en";
}

/** ko slug `<base>-ko` → `<base>`. en slug는 그대로. */
export function koBaseSlug(slug: string): string {
  return slug.endsWith("-ko") ? slug.slice(0, -3) : slug;
}

export function isKoSlug(slug: string): boolean {
  return slug.endsWith("-ko");
}

/** en slug ↔ ko slug 대응 확인. ko는 `-ko` 접미(단계1 translate.md 규격). */
export function isEnKoPair(enSlug: string, koSlug: string): boolean {
  return SLUG_RE.test(enSlug) && koSlug === `${enSlug}-ko`;
}

/**
 * 2-2: 에디션 내 slug 중복 검사(정확 일치 기준).
 * en/ko 공존(`foo` vs `foo-ko`)은 base가 달라도 정확 일치가 아니므로 허용된다.
 * 전역 중복은 언어 스코프로 분리한다 — editions.ts allStoryRefs의 lang 필터 참조.
 */
export function findWithinEditionDuplicates(slugs: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) dupes.push(slug);
    seen.add(slug);
  }
  return dupes;
}

export interface Violation {
  path: string;
  message: string;
}

export interface ValidationResult {
  file: string;
  valid: boolean;
  violations: Violation[];
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function validateStory(file: string, story: unknown, idx: number, out: Violation[]): void {
  const p = `stories[${idx}]`;
  if (typeof story !== "object" || story === null) {
    out.push({ path: p, message: "story must be an object" });
    return;
  }
  const s = story as Record<string, unknown>;

  if (!isStr(s.slug) || !SLUG_RE.test(s.slug)) {
    out.push({ path: `${p}.slug`, message: `invalid slug: ${JSON.stringify(s.slug)}` });
  }
  if (!isStr(s.headline) || s.headline.length < 1) {
    out.push({ path: `${p}.headline`, message: "headline non-empty required" });
  }
  if (s.dek !== undefined && !isStr(s.dek)) {
    out.push({ path: `${p}.dek`, message: "dek must be string" });
  }
  if (!["BRIEF", "DEEP", "DATA"].includes(s.type as string)) {
    out.push({ path: `${p}.type`, message: `type must be BRIEF|DEEP|DATA, got ${JSON.stringify(s.type)}` });
  }
  if (s.publication !== undefined && !["scheduled", "manual"].includes(s.publication as string)) {
    out.push({ path: `${p}.publication`, message: "publication must be scheduled|manual" });
  }
  if (typeof s.readMinutes !== "number" || s.readMinutes < 1 || s.readMinutes > 60) {
    out.push({ path: `${p}.readMinutes`, message: "readMinutes must be 1..60" });
  }
  if (!Array.isArray(s.tldr) || s.tldr.length !== 3 || !s.tldr.every((t) => isStr(t) && t.length >= 1)) {
    out.push({ path: `${p}.tldr`, message: "tldr must be exactly 3 non-empty strings" });
  }
  if (!Array.isArray(s.body) || s.body.length < 1) {
    out.push({ path: `${p}.body`, message: "body must be an array with >=1 block" });
  } else {
    s.body.forEach((block, bi) => {
      const bp = `${p}.body[${bi}]`;
      if (typeof block !== "object" || block === null) {
        out.push({ path: bp, message: "body block must be object" });
        return;
      }
      const b = block as Record<string, unknown>;
      if (!isStr(b.text) || b.text.length < 1) out.push({ path: `${bp}.text`, message: "text non-empty required" });
      if (
        !Array.isArray(b.citations) ||
        b.citations.length < 1 ||
        !b.citations.every((c) => Number.isInteger(c) && c > 0)
      ) {
        out.push({ path: `${bp}.citations`, message: "citations must be array of positive ints" });
      }
    });
  }
  if (!isStr(s.whyItMatters) || s.whyItMatters.length < 1) {
    out.push({ path: `${p}.whyItMatters`, message: "whyItMatters non-empty required" });
  }
  if (!isStr(s.editorNote) || s.editorNote.length < 1) {
    out.push({ path: `${p}.editorNote`, message: "editorNote non-empty required" });
  }
  if (!Array.isArray(s.cluster) || s.cluster.length < 1) {
    out.push({ path: `${p}.cluster`, message: "cluster must have >=1 link" });
  } else {
    s.cluster.forEach((cl, ci) => {
      if (typeof cl !== "object" || cl === null) {
        out.push({ path: `${p}.cluster[${ci}]`, message: "cluster link must be object" });
        return;
      }
      const c = cl as Record<string, unknown>;
      if (!isStr(c.url) || !URL_RE.test(c.url)) out.push({ path: `${p}.cluster[${ci}].url`, message: "url required" });
      if (!isStr(c.source) || c.source.length < 1) out.push({ path: `${p}.cluster[${ci}].source`, message: "source required" });
      if (c.title !== undefined && !isStr(c.title)) out.push({ path: `${p}.cluster[${ci}].title`, message: "title must be string" });
    });
  }
  if (!Array.isArray(s.sources) || s.sources.length < 1) {
    out.push({ path: `${p}.sources`, message: "sources must have >=1 citation" });
  } else {
    const ids = new Set<number>();
    s.sources.forEach((c, ci) => {
      if (typeof c !== "object" || c === null) {
        out.push({ path: `${p}.sources[${ci}]`, message: "citation must be object" });
        return;
      }
      const src = c as Record<string, unknown>;
      if (!Number.isInteger(src.id) || (src.id as number) < 1) {
        out.push({ path: `${p}.sources[${ci}].id`, message: "id must be positive int" });
      } else {
        if (ids.has(src.id as number)) out.push({ path: `${p}.sources[${ci}].id`, message: `duplicate id ${src.id}` });
        ids.add(src.id as number);
      }
      if (!isStr(src.url) || !URL_RE.test(src.url)) out.push({ path: `${p}.sources[${ci}].url`, message: "url required" });
      if (!isStr(src.source) || src.source.length < 1) out.push({ path: `${p}.sources[${ci}].source`, message: "source required" });
      if (src.title !== undefined && !isStr(src.title)) out.push({ path: `${p}.sources[${ci}].title`, message: "title must be string" });
      if (src.publishedAt !== undefined && !isStr(src.publishedAt)) out.push({ path: `${p}.sources[${ci}].publishedAt`, message: "publishedAt must be string" });
    });
  }
  if (s.tags !== undefined) {
    if (!Array.isArray(s.tags) || !s.tags.every((t) => isStr(t))) {
      out.push({ path: `${p}.tags`, message: "tags must be array of strings" });
    }
  }
  if (s.confidence !== undefined && !["high", "medium", "low"].includes(s.confidence as string)) {
    out.push({ path: `${p}.confidence`, message: "confidence must be high|medium|low" });
  }
}

export function validateEditionData(data: unknown): Violation[] {
  const out: Violation[] = [];
  if (typeof data !== "object" || data === null) {
    out.push({ path: "$", message: "edition must be an object" });
    return out;
  }
  const d = data as Record<string, unknown>;
  if (!isStr(d.date) || !DATE_RE.test(d.date)) out.push({ path: "date", message: "date must be YYYY-MM-DD" });
  if (!isStr(d.generatedAt)) out.push({ path: "generatedAt", message: "generatedAt string required" });
  if (!isVertical(d.vertical)) {
    out.push({ path: "vertical", message: `vertical must be ${CATEGORY_KEYS.join("|")}` });
  }
  if (!isStr(d.title) || d.title.length < 1) out.push({ path: "title", message: "title non-empty required" });
  if (!isStr(d.summary) || d.summary.length < 1) out.push({ path: "summary", message: "summary non-empty required" });
  if (!isLang(d.lang)) out.push({ path: "lang", message: "lang must be ko|en (A안: 언어 미표기 실패)" });
  if (!Array.isArray(d.stories) || d.stories.length < 1 || d.stories.length > 8) {
    out.push({ path: "stories", message: "stories must be 1..8 items" });
    return out;
  }

  // 2-2 slug 규칙: 동일 에디션 내 정확 일치 중복 거부 유지.
  // en/ko 공존 허용 — `foo`(en)와 `foo-ko`(ko)는 다른 slug이므로 충돌 아님.
  const slugs = new Set<string>();
  d.stories.forEach((story, idx) => {
    validateStory("(stories)", story, idx, out);
    const s = story as Record<string, unknown> | null;
    if (s && isStr(s.slug) && SLUG_RE.test(s.slug)) {
      if (slugs.has(s.slug)) out.push({ path: `stories[${idx}].slug`, message: `duplicate slug within edition: ${s.slug}` });
      slugs.add(s.slug);
      // 언어·slug 접미사 일치: ko는 `-ko` 접미(translate.md 규격), en은 접미사 금지.
      // en/ko 공존은 파일 분리로 허용되며 대응 확인은 isEnKoPair +
      // validate-i18n checkCitationParity가 담당.
      if (isLang(d.lang)) {
        if (d.lang === "ko" && !isKoSlug(s.slug)) {
          out.push({ path: `stories[${idx}].slug`, message: `ko story slug must end with -ko: ${s.slug}` });
        } else if (d.lang === "en" && isKoSlug(s.slug)) {
          out.push({ path: `stories[${idx}].slug`, message: `en story slug must not end with -ko: ${s.slug}` });
        }
      }
    }
    // Publish gates
    if (s && Array.isArray(s.sources)) {
      const distinct = new Set((s.sources as Array<Record<string, unknown>>).map((c) => c.source).filter(isStr));
      if (distinct.size < 2) {
        out.push({ path: `stories[${idx}]`, message: `publish gate: needs >=2 distinct sources (has ${distinct.size})` });
      }
      const ids = new Set((s.sources as Array<Record<string, unknown>>).filter((c) => Number.isInteger(c.id) && (c.id as number) > 0).map((c) => c.id as number));
      if (Array.isArray(s.body)) {
        for (const [bi, block] of s.body.entries()) {
          if (typeof block !== "object" || block === null) continue;
          const cits = (block as Record<string, unknown>).citations;
          for (const cid of Array.isArray(cits) ? cits : []) {
            if (!ids.has(cid as number)) {
              out.push({ path: `stories[${idx}].body[${bi}]`, message: `publish gate: citation ${cid} does not resolve to sources[]` });
            }
          }
        }
      }
    }
  });
  return out;
}

function violationsForFile(file: string, raw: string): Violation[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err: unknown) {
    return [{ path: "$", message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }];
  }
  return validateEditionData(data);
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".astro", "raw"]);

export async function validateEditionFile(path: string): Promise<ValidationResult> {
  const raw = await readFile(path, "utf8");
  const violations = violationsForFile(path, raw);
  return { file: path, valid: violations.length === 0, violations };
}

export async function validatePath(target: string): Promise<ValidationResult[]> {
  const info = await stat(target);
  if (info.isFile()) {
    return [await validateEditionFile(target)];
  }
  // directory: validate every .json recursively
  const results: ValidationResult[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name));
        continue;
      }
      if (extname(entry.name) !== ".json" || entry.name === "manifest.json") continue;
      const file = join(dir, entry.name);
      const violations = violationsForFile(file, await readFile(file, "utf8"));
      results.push({ file, valid: violations.length === 0, violations });
    }
  }
  await walk(target);
  return results;
}

export function summarize(results: ValidationResult[]): { total: number; failed: number; lines: string[] } {
  const failed = results.filter((r) => !r.valid).length;
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`${r.valid ? "PASS" : "FAIL"} ${r.file}`);
    for (const v of r.violations) lines.push(`     ${v.path}: ${v.message}`);
  }
  return { total: results.length, failed, lines };
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? join(process.cwd(), "src", "content", "editions");
  const results = await validatePath(target);
  const { total, failed, lines } = summarize(results);
  for (const line of lines) console.log(line);
  console.log(`\n${total} file(s) checked, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("validate failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
