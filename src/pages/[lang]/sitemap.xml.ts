import type { APIRoute } from 'astro';
import { dateEntries, editionHref, editionsInLang, getEditions, getStoryRefs, monthEntries, monthHref, verticalHref, type Lang } from '../../lib/editions';
import { VERTICALS } from '../../lib/site';
import { absoluteUrl } from '../../lib/seo';

export function getStaticPaths() {
  return (['en', 'ko'] as const).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const editions = editionsInLang(await getEditions(), lang);
  const paths = [
    `/${lang}`,
    `/${lang}/archive`,
    ...VERTICALS.map((vertical) => verticalHref(vertical, lang)),
    ...monthEntries(editions).map((entry) => monthHref(`${entry.year}-${entry.month}-01`, lang)),
    ...dateEntries(editions).map((entry) => editionHref(entry.date, lang)),
    ...(await getStoryRefs(lang)).map((ref) => ref.href),
  ];
  const body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...paths.map((path) => `  <url><loc>${absoluteUrl(path).replace(/&/g, '&amp;')}</loc></url>`), '</urlset>', ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
