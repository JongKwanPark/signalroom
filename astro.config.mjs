import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE_URL = (process.env.SITE_URL || 'https://signaldaily.cloud').replace(/\/+$/, '');

// Pages that render <meta name="robots" content="noindex"> must not be listed.
const NOINDEX_PATHS = new Set(['/search', '/404']);

// lastmod for story and edition pages, read from the same edition JSON the
// content collection loads (newest date wins, matching allStoryRefs()).
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
    for (const story of edition.stories ?? []) {
      const storyPath = `/story/${story.slug}`;
      if (!byPath.has(storyPath)) byPath.set(storyPath, generatedAt);
    }
  }
  return byPath;
}

const LASTMOD = lastmodIndex();

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !NOINDEX_PATHS.has(new URL(page).pathname.replace(/\/+$/, '')),
      customSitemaps: [`${SITE_URL}/news-sitemap.xml`],
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
