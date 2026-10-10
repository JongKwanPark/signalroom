import { getCollection, type CollectionEntry } from 'astro:content';
import { VERTICALS, type Vertical } from './categories';
import { SITE } from './site';
import { articleMetadataSchema, type ArticleFormat } from '../../scripts/validate-article';
import { pad } from './format';

export type Edition = CollectionEntry<'editions'>;
export type EditionData = Edition['data'];
export type NewsStory = EditionData['stories'][number];
export type Article = CollectionEntry<'articles'>;
export type Publication = 'scheduled' | 'manual';
// Views retain the existing convenience fields; standalone writing has no news payload.
export type Story = Omit<NewsStory, 'type' | 'publication'> & {
  type: NewsStory['type'] | 'ESSAY' | 'FEATURE' | 'ANALYSIS';
  publication: Publication;
};
export type StorySource = Story['sources'][number];
export type StoryClusterLink = Story['cluster'][number];

// 2-3: 에디션 언어. 기존 무prefix 호출 호환을 위해 조회 함수의 lang 기본값은 'en'.
// 파일명 운용 규약: `<vertical>.json` = en, `<vertical>.ko.json` = ko.
export type Lang = 'ko' | 'en';

interface StoryRefBase {
  slug: string;
  lang: Lang;
  story: Story;
  vertical: Vertical;
  date: string;
  generatedAt: string;
  href: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  publication: Publication;
  wordCount: number;
}

export interface EditionStoryRef extends StoryRefBase {
  kind: 'edition';
  editionId: string;
  articleId?: never;
  format?: never;
}

export interface ArticleStoryRef extends StoryRefBase {
  kind: 'article';
  articleId: string;
  editionId?: never;
  format: ArticleFormat;
  translationKey?: string;
}

export type StoryRef = EditionStoryRef | ArticleStoryRef;

/** 에디션 언어. lang 미표기 구 파일과의 호환을 위해 기본값 'en'. */
export function editionLang(edition: Edition): Lang {
  const lang = (edition.data as { lang?: unknown }).lang;
  return lang === 'ko' ? 'ko' : 'en';
}

/** 언어 필터: 지정 언어 에디션만 반환. */
export function editionsInLang(editions: Edition[], lang: Lang): Edition[] {
  return editions.filter((edition) => editionLang(edition) === lang);
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

export function primarySource(story: Story): StorySource | undefined {
  return [...story.sources].sort((a, b) => a.id - b.id)[0];
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

export function editionHref(date: string, lang?: Lang): string {
  const base = `/${date.split('-').join('/')}`;
  return lang === undefined ? base : `/${lang}${base}`;
}

export function monthHref(date: string, lang?: Lang): string {
  const [year, month] = date.split('-');
  const base = `/${year}/${month}`;
  return lang === undefined ? base : `/${lang}${base}`;
}

export function storyHref(slug: string, lang?: Lang): string {
  const base = `/story/${slug}`;
  return lang === undefined ? base : `/${lang}${base}`;
}

export function verticalHref(vertical: Vertical, lang?: Lang): string {
  const base = `/${vertical}`;
  return lang === undefined ? base : `/${lang}${base}`;
}

/**
 * 3-1: 언어 prefix 경로 유틸. 기존 무prefix 호출(lang 생략)은 레거시 경로를
 * 그대로 반환하므로 기존 호출부와 호환된다. lang을 넘기면 `/{lang}` prefix 경로.
 */
export function langOfPath(pathname: string): Lang | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/(ko|en)(?=\/|$)/);
  return match ? (match[1] as Lang) : null;
}

export function stripLangPrefix(pathname: string): { lang: Lang | null; rest: string } {
  const lang = langOfPath(pathname);
  if (!lang) return { lang: null, rest: pathname };
  const rest = pathname.replace(/\/+$/, '').slice(lang.length + 1) || '/';
  return { lang, rest };
}

/**
 * 3-3 Header 전환 링크용: 현재 경로의 대응 언어 경로를 반환한다.
 * 스토리 경로는 slug 규칙(en `<base>` ↔ ko `<base>-ko`, plan §9 1-1)으로 매핑하고,
 * 그 외는 prefix 치환(무prefix면 prefix 부착)한다.
 */
export function counterpartPath(pathname: string, target: Lang): string {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/';
  const { lang: current, rest } = stripLangPrefix(normalized);
  if (current === target) return normalized;
  const storyMatch = rest.match(/^\/story\/([^/]+)$/);
  if (storyMatch) {
    const slug = storyMatch[1];
    const mapped =
      target === 'ko' ? (slug.endsWith('-ko') ? slug : `${slug}-ko`) : koBaseSlug(slug);
    return `/${target}/story/${mapped}`;
  }
  if (rest === '/' || rest === '') return `/${target}`;
  return `/${target}${rest}`;
}

/** ko `<base>-ko` → en `<base>` (validate-i18n koBaseSlug과 동일 규칙). */
export function koBaseSlug(slug: string): string {
  return slug.endsWith('-ko') ? slug.slice(0, -3) : slug;
}

export function toStoryRef(edition: Edition, story: NewsStory): EditionStoryRef {
  const lang = editionLang(edition);
  const parsed = new Date(edition.data.generatedAt);
  const publishedAt = Number.isNaN(parsed.getTime())
    ? `${edition.data.date}T00:00:00.000Z` : parsed.toISOString();
  const publication = story.publication ?? 'scheduled';
  return {
    kind: 'edition',
    slug: story.slug,
    lang,
    story: { ...story, publication },
    author: SITE.author,
    publishedAt,
    updatedAt: publishedAt,
    publication,
    wordCount: story.body.reduce((total, block) => total + countWords(block.text), 0),
    vertical: edition.data.vertical,
    editionId: edition.id,
    date: edition.data.date,
    generatedAt: edition.data.generatedAt,
    // 3-1: 정식(canonical) 경로는 언어 prefix 경로. 레거시 무prefix URL은
    // astro.config.mjs 리다이렉트로 /en/**(ko는 /ko/**)에 흡수된다.
    href: storyHref(story.slug, lang),
  };
}

export function allStoryRefs(editions: Edition[], lang: Lang = 'en'): StoryRef[] {
  // 언어 스코프 분리: 지정 언어 에디션만 순회하므로 en `foo`와 ko `foo-ko`가
  // 서로의 중복 검사에 걸리지 않는다. 에디션 내 정확 일치 중복은 거부 유지.
  const seen = new Set<string>();
  const refs: StoryRef[] = [];
  for (const edition of editionsInLang(editions, lang)) {
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

function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

/** Normalize only public, schema-valid standalone entries. */
export function toArticleRef(article: Article): ArticleStoryRef {
  const data = articleMetadataSchema.parse(article.data);
  if (data.draft) throw new Error(`Draft article cannot become a public StoryRef: ${article.id}`);
  const wordCount = countWords(article.body ?? '');
  return {
    kind: 'article',
    articleId: article.id,
    slug: data.slug,
    lang: data.lang,
    vertical: data.category,
    date: data.publishedAt.slice(0, 10),
    generatedAt: data.publishedAt,
    publishedAt: data.publishedAt,
    updatedAt: data.updatedAt ?? data.publishedAt,
    author: data.author,
    publication: 'manual',
    format: data.format,
    translationKey: data.translationKey,
    href: storyHref(data.slug, data.lang),
    wordCount,
    story: {
      slug: data.slug,
      headline: data.title,
      dek: data.description,
      type: data.format.toUpperCase() as 'ESSAY' | 'FEATURE' | 'ANALYSIS',
      publication: 'manual',
      readMinutes: Math.max(1, Math.ceil(wordCount / 200)),
      tldr: [],
      body: [],
      whyItMatters: '',
      editorNote: '',
      cluster: [],
      sources: data.sources.map((source, index) => ({ ...source, id: index + 1 })),
      tags: data.tags,
      confidence: 'medium',
    },
  };
}

export function compareStoryRefs(a: StoryRef, b: StoryRef): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    || verticalOrder(a.vertical) - verticalOrder(b.vertical)
    || a.slug.localeCompare(b.slug);
}

/** Never silently shadow a public URL across collections or standalone entries. */
export function combineStoryRefs(editionRefs: StoryRef[], articleRefs: ArticleStoryRef[]): StoryRef[] {
  const seen = new Map<string, StoryRef>();
  for (const ref of [...editionRefs, ...articleRefs]) {
    const key = `${ref.lang}/${ref.slug}`;
    const previous = seen.get(key);
    if (previous) {
      throw new Error(`Public story slug collision (${key}): ${previous.kind} ${previous.editionId ?? previous.articleId} and ${ref.kind} ${ref.editionId ?? ref.articleId}`);
    }
    seen.set(key, ref);
  }
  return [...seen.values()].sort(compareStoryRefs);
}

export function allArticleRefs(articles: Article[], lang: Lang = 'en'): ArticleStoryRef[] {
  const refs = articles.filter((article) => article.data.draft === false && article.data.lang === lang)
    .map(toArticleRef);
  // Translation keys identify one public article in each language.
  const keys = new Set<string>();
  for (const ref of refs) {
    if (!ref.translationKey) continue;
    if (keys.has(ref.translationKey)) {
      throw new Error(`Ambiguous article translationKey (${lang}): ${ref.translationKey}`);
    }
    keys.add(ref.translationKey);
  }
  return combineStoryRefs([], refs) as ArticleStoryRef[];
}

let articlesPromise: Promise<Article[]> | null = null;

export async function getArticleRefs(lang: Lang = 'en'): Promise<ArticleStoryRef[]> {
  articlesPromise ??= getCollection('articles', (article) => article.data.draft === false);
  return allArticleRefs(await articlesPromise, lang);
}

export async function getStoryRefs(lang: Lang = 'en'): Promise<StoryRef[]> {
  const [editions, articles] = await Promise.all([getEditions(), getArticleRefs(lang)]);
  return combineStoryRefs(allStoryRefs(editions, lang), articles);
}

/** Articles use explicit translation keys; editions retain the existing -ko rule. */
export async function getTranslationRef(ref: StoryRef, targetLang: Lang): Promise<StoryRef | undefined> {
  if (ref.lang === targetLang) return ref;
  if (ref.kind === 'article') {
    if (!ref.translationKey) return undefined;
    return (await getArticleRefs(targetLang)).find((candidate) => candidate.translationKey === ref.translationKey);
  }
  const slug = targetLang === 'ko' ? `${koBaseSlug(ref.slug)}-ko` : koBaseSlug(ref.slug);
  return (await getStoryRefs(targetLang)).find((candidate) => candidate.kind === 'edition' && candidate.slug === slug);
}

export async function getStoryRef(slug: string, lang: Lang = 'en'): Promise<StoryRef | undefined> {
  return (await getStoryRefs(lang)).find((ref) => ref.slug === slug);
}

export function newestDate(editions: Edition[]): string | null {
  return editions.length > 0 ? editions[0].data.date : null;
}

export function editionsOnDate(editions: Edition[], date: string, lang?: Lang): Edition[] {
  return editions.filter(
    (edition) => edition.data.date === date && (lang === undefined || editionLang(edition) === lang),
  );
}

export function editionsForVertical(editions: Edition[], vertical: Vertical, lang?: Lang): Edition[] {
  return editions.filter(
    (edition) => edition.data.vertical === vertical && (lang === undefined || editionLang(edition) === lang),
  );
}

export function refsOnDate(refs: StoryRef[], date: string, lang?: Lang): StoryRef[] {
  return refs.filter((ref) => ref.date === date && (lang === undefined || ref.lang === lang));
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
