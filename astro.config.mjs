import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE_URL = (process.env.SITE_URL || 'https://signaldaily.cloud').replace(/\/+$/, '');

// Pages that render <meta name="robots" content="noindex"> must not be listed.
const NOINDEX_PATHS = new Set(['/search', '/en/search', '/ko/search', '/404']);
const LEGACY_LOCALIZED = /^\/(?:story\/[^/]+|ai|bio|geo|markets|archive|\d{4}\/\d{2}(?:\/\d{2})?)$/;

// lastmod for story and edition pages, read from the same edition JSON the
// content collection loads (newest date wins, matching allStoryRefs()).
// 3-2: 언어 prefix 경로(`/en/...`, `/ko/...`)도 같은 lastmod에 매핑한다.
// 레거시 무prefix 경로는 유지하되 정식 URL은 언어 경로다.
function lastmodIndex() {
  const dir = new URL('./src/content/editions/', import.meta.url);
  const byPath = new Map();
  if (!existsSync(dir)) return byPath;
  const editions = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dateDir = new URL(`${entry.name}/`, dir);
    for (const file of readdirSync(dateDir)) {
      if (file.endsWith('.json')) editions.push(JSON.parse(readFileSync(new URL(file, dateDir), 'utf8')));
    }
  }
  editions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const edition of editions) {
    const generatedAt = new Date(edition.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) continue;
    const editionPath = `/${String(edition.date).split('-').join('/')}`;
    const current = byPath.get(editionPath);
    if (!current || generatedAt > current) byPath.set(editionPath, generatedAt);
    const lang = edition.lang === 'ko' ? 'ko' : 'en';
    const localizedEditionPath = `/${lang}${editionPath}`;
    const localizedCurrent = byPath.get(localizedEditionPath);
    if (!localizedCurrent || generatedAt > localizedCurrent) byPath.set(localizedEditionPath, generatedAt);
    for (const story of edition.stories ?? []) {
      const storyPath = `/story/${story.slug}`;
      if (!byPath.has(storyPath)) byPath.set(storyPath, generatedAt);
      // 3-1 언어 prefix 경로 매핑 (lang 미표기 구 파일은 en으로 간주).
      const langStoryPath = `/${lang}/story/${story.slug}`;
      if (!byPath.has(langStoryPath)) byPath.set(langStoryPath, generatedAt);
    }
  }
  return byPath;
}

// 3-2 무prefix 정책(리다이렉트 권장안 채택, plan-bilingual §4-3 3-2):
// 기존 스토리 URL(`/story/<slug>`) → 언어 경로(`/en/story/<slug>`, ko는 `/ko/...`) 301.
// 스토리 언어별 페이지가 존재하므로 스토리부터 적용한다. 에디션·버티컬·월
// 인덱스의 언어별 페이지는 후속 범위이며, 해당 리다이렉트는 그때 확장한다.
function legacyStoryRedirects() {
  const dir = new URL('./src/content/editions/', import.meta.url);
  const redirects = {};
  if (!existsSync(dir)) return redirects;
  const seen = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dateDir = new URL(`${entry.name}/`, dir);
    for (const file of readdirSync(dateDir)) {
      if (!file.endsWith('.json')) continue;
      let edition;
      try {
        edition = JSON.parse(readFileSync(new URL(file, dateDir), 'utf8'));
      } catch {
        continue;
      }
      const lang = edition.lang === 'ko' ? 'ko' : 'en';
      for (const story of edition.stories ?? []) {
        if (typeof story?.slug !== 'string' || seen.has(story.slug)) continue;
        seen.add(story.slug);
        redirects[`/story/${story.slug}`] = {
          status: 301,
          destination: `/${lang}/story/${story.slug}`,
        };
      }
    }
  }
  return redirects;
}

const LASTMOD = lastmodIndex();

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  redirects: legacyStoryRedirects(),
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname.replace(/\/+$/, '') || '/';
        return !NOINDEX_PATHS.has(pathname) && pathname !== '/' && !LEGACY_LOCALIZED.test(pathname) && !/^\/(?:en|ko)(?:\/|$)/.test(pathname) && !/\.(?:xml|json|txt)$/.test(pathname);
      },
      customSitemaps: [
        `${SITE_URL}/en/sitemap.xml`, `${SITE_URL}/ko/sitemap.xml`,
        `${SITE_URL}/en/news-sitemap.xml`, `${SITE_URL}/ko/news-sitemap.xml`,
      ],
      serialize(item) {
        const lastmod = LASTMOD.get(new URL(item.url).pathname.replace(/\/+$/, ''));
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
  ],
  prefetch: true,
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
