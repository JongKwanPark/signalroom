import { getCollection, type CollectionEntry } from 'astro:content';
import { VERTICALS, type Vertical } from './site';
import { pad } from './format';

export type Edition = CollectionEntry<'editions'>;
export type EditionData = Edition['data'];
export type Story = EditionData['stories'][number];
export type StorySource = Story['sources'][number];
export type StoryClusterLink = Story['cluster'][number];

export interface StoryRef {
  slug: string;
  story: Story;
  vertical: Vertical;
  editionId: string;
  date: string;
  generatedAt: string;
  href: string;
}

let editionsPromise: Promise<Edition[]> | null = null;

export function getEditions(): Promise<Edition[]> {
  editionsPromise ??= loadEditions();
  return editionsPromise;
}

async function loadEditions(): Promise<Edition[]> {
  const entries = await getCollection('editions');
  const sorted = [...entries].sort(compareEditions);
  assertCitationIntegrity(sorted);
  return sorted;
}

export function verticalOrder(vertical: Vertical): number {
  return VERTICALS.indexOf(vertical);
}

export function compareEditions(a: Edition, b: Edition): number {
  return (
    b.data.date.localeCompare(a.data.date) ||
    verticalOrder(a.data.vertical) - verticalOrder(b.data.vertical)
  );
}

function assertCitationIntegrity(editions: Edition[]): void {
  const problems: string[] = [];
  for (const edition of editions) {
    for (const story of edition.data.stories) {
      const ids = new Set<number>();
      for (const source of story.sources) {
        if (ids.has(source.id)) {
          problems.push(`${edition.id}/${story.slug}: duplicate source id ${source.id}`);
        }
        ids.add(source.id);
      }
      story.body.forEach((block, index) => {
        for (const citation of block.citations) {
          if (!ids.has(citation)) {
            problems.push(
              `${edition.id}/${story.slug}: body[${index}] cites #${citation} which is not in sources[]`,
            );
          }
        }
      });
    }
  }
  if (problems.length > 0) {
    throw new Error(`Edition citation integrity failed:\n- ${problems.join('\n- ')}`);
  }
}

export function clusterSize(ref: StoryRef): number {
  return ref.story.cluster.length;
}

export function bySignal(a: StoryRef, b: StoryRef): number {
  return clusterSize(b) - clusterSize(a) || b.story.readMinutes - a.story.readMinutes;
}

export function sourceCount(story: Story): number {
  const hostnames = new Set<string>();
  for (const source of story.sources) {
    try {
      hostnames.add(new URL(source.url).hostname);
    } catch {
      hostnames.add(source.source);
    }
  }
  return hostnames.size;
}

export function editionHref(date: string): string {
  return `/${date.split('-').join('/')}`;
}

export function monthHref(date: string): string {
  const [year, month] = date.split('-');
  return `/${year}/${month}`;
}

export function storyHref(slug: string): string {
  return `/story/${slug}`;
}

export function verticalHref(vertical: Vertical): string {
  return `/${vertical}`;
}

export function toStoryRef(edition: Edition, story: Story): StoryRef {
  return {
    slug: story.slug,
    story,
    vertical: edition.data.vertical,
    editionId: edition.id,
    date: edition.data.date,
    generatedAt: edition.data.generatedAt,
    href: storyHref(story.slug),
  };
}

export function allStoryRefs(editions: Edition[]): StoryRef[] {
  const seen = new Set<string>();
  const refs: StoryRef[] = [];
  for (const edition of editions) {
    for (const story of edition.data.stories) {
      if (seen.has(story.slug)) {
        console.warn(`[signalroom] duplicate story slug ignored: ${story.slug}`);
        continue;
      }
      seen.add(story.slug);
      refs.push(toStoryRef(edition, story));
    }
  }
  return refs;
}

export async function getStoryRefs(): Promise<StoryRef[]> {
  return allStoryRefs(await getEditions());
}

export async function getStoryRef(slug: string): Promise<StoryRef | undefined> {
  return (await getStoryRefs()).find((ref) => ref.slug === slug);
}

export function newestDate(editions: Edition[]): string | null {
  return editions.length > 0 ? editions[0].data.date : null;
}

export function editionsOnDate(editions: Edition[], date: string): Edition[] {
  return editions.filter((edition) => edition.data.date === date);
}

export function editionsForVertical(editions: Edition[], vertical: Vertical): Edition[] {
  return editions.filter((edition) => edition.data.vertical === vertical);
}

export function refsOnDate(refs: StoryRef[], date: string): StoryRef[] {
  return refs.filter((ref) => ref.date === date);
}

export interface DateEntry {
  date: string;
  editions: Edition[];
  storyCount: number;
  sourceCount: number;
}

export function dateEntries(editions: Edition[]): DateEntry[] {
  const byDate = new Map<string, Edition[]>();
  for (const edition of editions) {
    const list = byDate.get(edition.data.date) ?? [];
    list.push(edition);
    byDate.set(edition.data.date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      editions: list,
      storyCount: list.reduce((total, edition) => total + edition.data.stories.length, 0),
      sourceCount: list.reduce(
        (total, edition) =>
          total + edition.data.stories.reduce((sum, story) => sum + story.sources.length, 0),
        0,
      ),
    }));
}

export interface MonthEntry {
  year: string;
  month: string;
  dates: DateEntry[];
  storyCount: number;
}

export function monthEntries(editions: Edition[]): MonthEntry[] {
  const byMonth = new Map<string, DateEntry[]>();
  for (const entry of dateEntries(editions)) {
    const key = entry.date.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(entry);
    byMonth.set(key, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, dates]) => ({
      year: key.slice(0, 4),
      month: key.slice(5, 7),
      dates,
      storyCount: dates.reduce((total, date) => total + date.storyCount, 0),
    }));
}

export function dateParam(date: string): { year: string; month: string; day: string } {
  const [year, month, day] = date.split('-');
  return { year, month, day };
}

export function isoDate(year: string, month: string, day: string): string {
  return `${year}-${month}-${day}`;
}

export function timeLabel(generatedAt: string): string {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}`;
}
