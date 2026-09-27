import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getStoryRefs, type Lang } from '../../lib/editions';
import { RSS_ITEM_CAP, SITE } from '../../lib/site';
import { formatDateLong } from '../../lib/format';

export function getStaticPaths() {
  return (['en', 'ko'] as const).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const refs = await getStoryRefs(lang);
  return rss({
    title: `${SITE.name} — ${lang.toUpperCase()}`,
    description: SITE.description,
    site: site ?? SITE.url,
    trailingSlash: false,
    items: refs.slice(0, RSS_ITEM_CAP).map((ref) => ({
      title: ref.story.headline,
      link: ref.href,
      pubDate: Number.isNaN(Date.parse(ref.generatedAt)) ? new Date(`${ref.date}T00:00:00Z`) : new Date(ref.generatedAt),
      description: `${ref.story.dek ?? ref.story.tldr[0]} (${formatDateLong(ref.date)})`,
      categories: [ref.vertical, ref.story.type, ...ref.story.tags],
    })),
    customData: `<language>${lang === 'ko' ? 'ko-kr' : 'en-us'}</language><copyright>© ${new Date().getUTCFullYear()} ${SITE.name}</copyright>`,
  });
};
