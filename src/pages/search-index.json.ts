import type { APIRoute } from 'astro';
import { getStoryRefs } from '../lib/editions';
import { buildSearchIndex } from '../lib/search';

export const GET: APIRoute = async () => {
  const refs = await getStoryRefs();
  const index = buildSearchIndex(refs);

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
