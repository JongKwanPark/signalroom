// Hand-rolled validation mirroring src/content.config.ts (Zod schema) PLUS
// publish gates. Exits non-zero on any violation. Usable as a module:
//   import { validateEditionFile, validateEditionData } from "./validate.ts";
// No new dependencies (node built-ins only).
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

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
  if (!["ai", "bio", "geo", "markets"].includes(d.vertical as string)) {
    out.push({ path: "vertical", message: "vertical must be ai|bio|geo|markets" });
  }
  if (!isStr(d.title) || d.title.length < 1) out.push({ path: "title", message: "title non-empty required" });
  if (!isStr(d.summary) || d.summary.length < 1) out.push({ path: "summary", message: "summary non-empty required" });
  if (!Array.isArray(d.stories) || d.stories.length < 1 || d.stories.length > 8) {
    out.push({ path: "stories", message: "stories must be 1..8 items" });
    return out;
  }

  const slugs = new Set<string>();
  d.stories.forEach((story, idx) => {
    validateStory("(stories)", story, idx, out);
    const s = story as Record<string, unknown> | null;
    if (s && isStr(s.slug) && SLUG_RE.test(s.slug)) {
      if (slugs.has(s.slug)) out.push({ path: `stories[${idx}].slug`, message: `duplicate slug within edition: ${s.slug}` });
      slugs.add(s.slug);
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
