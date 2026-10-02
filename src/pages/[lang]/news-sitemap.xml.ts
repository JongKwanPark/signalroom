import type { APIRoute } from 'astro';
import { getStoryRefs, type Lang } from '../../lib/editions';
import { SITE } from '../../lib/site';
import { absoluteUrl } from '../../lib/seo';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function getStaticPaths() {
  return (['en', 'ko'] as const).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const cutoff = Date.now() - WINDOW_MS;
  const refs = (await getStoryRefs(lang)).filter((ref) => ref.kind === 'edition').map((ref) => ({ ref, published: new Date(ref.generatedAt) }))
    .filter(({ published }) => !Number.isNaN(published.getTime()) && published.getTime() >= cutoff);
  const entries = refs.map(({ ref, published }) => [
    '  <url>',
    `    <loc>${escapeXml(absoluteUrl(ref.href))}</loc>`,
    '    <news:news>',
    `      <news:publication><news:name>${escapeXml(SITE.name)}</news:name><news:language>${lang}</news:language></news:publication>`,
    `      <news:publication_date>${published.toISOString()}</news:publication_date>`,
    `      <news:title>${escapeXml(ref.story.headline)}</news:title>`,
    '    </news:news>',
    '  </url>',
  ].join('\n'));
  const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">', ...entries, '</urlset>', ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
