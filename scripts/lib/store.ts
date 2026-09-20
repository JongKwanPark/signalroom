// JSONL + manifest storage.
// Raw collected data  -> data/raw/{date}/{source}.jsonl       (gitignored)
// Normalized verticals-> data/editions-source/{date}/{vertical}.jsonl (committed)
// Manifest            -> data/editions-source/{date}/manifest.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RawItem, SourceHealth, Vertical } from "./types.ts";

export function dataRoot(): string {
  return join(process.cwd(), "data");
}

export function rawPath(date: string, source: string): string {
  return join(dataRoot(), "raw", date, `${source}.jsonl`);
}

export function editionsSourcePath(date: string, vertical: Vertical): string {
  return join(dataRoot(), "editions-source", date, `${vertical}.jsonl`);
}

export function manifestPath(date: string): string {
  return join(dataRoot(), "editions-source", date, "manifest.json");
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export function toJsonl<T>(rows: T[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}

export function fromJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export async function writeRaw(date: string, source: string, items: RawItem[]): Promise<void> {
  const path = rawPath(date, source);
  await ensureDir(path);
  await writeFile(path, toJsonl(items), "utf8");
}

export async function writeVertical(
  date: string,
  vertical: Vertical,
  items: RawItem[]
): Promise<void> {
  const path = editionsSourcePath(date, vertical);
  await ensureDir(path);
  await writeFile(path, toJsonl(items), "utf8");
}

export async function readVertical(date: string, vertical: Vertical): Promise<RawItem[]> {
  try {
    const text = await readFile(editionsSourcePath(date, vertical), "utf8");
    return fromJsonl<RawItem>(text);
  } catch {
    return [];
  }
}

export interface Manifest {
  date: string;
  generatedAt: string;
  verticals: Record<Vertical, { items: number; sources: SourceHealth[] }>;
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  const path = manifestPath(manifest.date);
  await ensureDir(path);
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function readManifest(date: string): Promise<Manifest | null> {
  try {
    const text = await readFile(manifestPath(date), "utf8");
    return JSON.parse(text) as Manifest;
  } catch {
    return null;
  }
}
