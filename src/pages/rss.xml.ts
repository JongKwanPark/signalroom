import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getStoryRefs } from '../lib/editions';
import { RSS_ITEM_CAP, SITE } from '../lib/site';
import { formatDateLong } from '../lib/format';

export const GET: APIRoute = async (context) => {
  const refs = await getStoryRefs();

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: refs.slice(0, RSS_ITEM_CAP).map((ref) => ({
      title: ref.story.headline,
      link: ref.href,
      pubDate: pubDate(ref.generatedAt, ref.date),
      description: `${ref.story.dek ?? ref.story.tldr[0]} (${formatDateLong(ref.date)})`,
      categories: [ref.vertical, ref.story.type, ...ref.story.tags],
    })),
    customData: `<language>en-us</language><copyright>© ${new Date().getUTCFullYear()} ${SITE.name}</copyright>`,
  });
};

function pubDate(generatedAt: string, fallbackDate: string): Date {
  const parsed = new Date(generatedAt);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(`${fallbackDate}T00:00:00Z`);
}
