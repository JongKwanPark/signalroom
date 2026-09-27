import type { APIRoute } from 'astro';
import { getStoryRefs, type Lang } from '../../lib/editions';
import { buildSearchIndex } from '../../lib/search';

export function getStaticPaths() {
  return (['en', 'ko'] as const).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => new Response(JSON.stringify(buildSearchIndex(await getStoryRefs(params.lang as Lang))), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
});
