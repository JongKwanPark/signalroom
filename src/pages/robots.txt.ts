import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL(SITE.url)).href.replace(/\/+$/, '');
  const body = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${base}/sitemap-index.xml`,
    `Sitemap: ${base}/en/sitemap.xml`,
    `Sitemap: ${base}/ko/sitemap.xml`,
    `Sitemap: ${base}/en/news-sitemap.xml`,
    `Sitemap: ${base}/ko/news-sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
