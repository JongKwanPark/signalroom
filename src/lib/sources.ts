import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SourceRegistryEntry {
  id: string;
  name: string;
  url: string;
  kind: string;
  note?: string;
}

const REGISTRY_PATH = 'src/data/sources.json';

function isEntry(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalize(value: Record<string, unknown>, index: number): SourceRegistryEntry {
  const name = typeof value.name === 'string' && value.name.length > 0 ? value.name : 'Unnamed source';
  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : `source-${index + 1}`,
    name,
    url: typeof value.url === 'string' ? value.url : '',
    kind: typeof value.kind === 'string' && value.kind.length > 0 ? value.kind : 'other',
    note: typeof value.note === 'string' ? value.note : undefined,
  };
}

/**
 * The source registry is optional: the collection pipeline may not have
 * produced it yet. Missing or malformed files degrade to an empty registry so
 * the build always succeeds and /sources can render its empty state.
 */
export function loadSourceRegistry(): SourceRegistryEntry[] {
  try {
    const raw = readFileSync(resolve(process.cwd(), REGISTRY_PATH), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : isEntry(parsed) && Array.isArray(parsed.sources)
        ? parsed.sources
        : [];
    return list.filter(isEntry).map(normalize).filter((entry) => entry.url.length > 0);
  } catch {
    return [];
  }
}

export function groupSources(entries: SourceRegistryEntry[]): Array<{
  kind: string;
  entries: SourceRegistryEntry[];
}> {
  const groups = new Map<string, SourceRegistryEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.kind) ?? [];
    list.push(entry);
    groups.set(entry.kind, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, groupEntries]) => ({
      kind,
      entries: [...groupEntries].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
