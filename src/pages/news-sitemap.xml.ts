import type { APIRoute } from 'astro';
import { getStoryRefs } from '../lib/editions';
import { SITE } from '../lib/site';
import { absoluteUrl } from '../lib/seo';

// Google News sitemap: only articles published in the last 48 hours.
// https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
const WINDOW_MS = 48 * 60 * 60 * 1000;

export const GET: APIRoute = async () => {
  const cutoff = Date.now() - WINDOW_MS;
  const refs = await getStoryRefs();

  const entries = refs
    .map((ref) => ({ ref, published: new Date(ref.generatedAt) }))
    .filter(({ published }) => !Number.isNaN(published.getTime()) && published.getTime() >= cutoff)
    .map(({ ref, published }) =>
      [
        '  <url>',
        `    <loc>${escapeXml(absoluteUrl(ref.href))}</loc>`,
        '    <news:news>',
        '      <news:publication>',
        `        <news:name>${escapeXml(SITE.name)}</news:name>`,
        '        <news:language>en</news:language>',
        '      </news:publication>',
        `      <news:publication_date>${published.toISOString()}</news:publication_date>`,
        `      <news:title>${escapeXml(ref.story.headline)}</news:title>`,
        '    </news:news>',
        '  </url>',
      ].join('\n'),
    );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
