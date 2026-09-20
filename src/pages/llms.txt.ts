import type { APIRoute } from 'astro';
import { allStoryRefs, editionHref, getEditions, newestDate, verticalHref } from '../lib/editions';
import { SITE, VERTICALS, VERTICAL_META } from '../lib/site';
import { formatDateLong } from '../lib/format';

export const GET: APIRoute = async () => {
  const editions = await getEditions();
  const refs = allStoryRefs(editions);
  const latest = newestDate(editions);

  const lines: string[] = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.tagline} Six to eight cited items per day across four verticals. AI-assisted drafts, editor-reviewed, primary sources cited inline. Not advice.`,
    '',
    '## Reading the digest',
    '',
    '- Every story has a 3-line TL;DR, a "Why it matters" note, an editor\'s note and a numbered source list.',
    '- Body citations look like [1] and link to the exact source document.',
    '- Confidence labels (high/medium/low) describe the state of the evidence, not the importance of the story.',
    '- No login, no paywall, no tracking, no recommendation or advice of any kind.',
    '',
    '## Vertical feeds',
    '',
    ...VERTICALS.map(
      (vertical) => `- [${verticalHref(vertical)}](${verticalHref(vertical)}): ${VERTICAL_META[vertical].name} — ${VERTICAL_META[vertical].blurb}`,
    ),
    '',
  ];

  if (latest) {
    lines.push('## Latest edition', '', `- [${formatDateLong(latest)}](${editionHref(latest)}) — full edition page`, '');
    lines.push('## Recent stories', '');
    lines.push(
      ...refs
        .slice(0, 12)
        .map((ref) => `- [${ref.story.headline}](${ref.href}) (${ref.vertical.toUpperCase()}, ${ref.date})`),
    );
  } else {
    lines.push('## Latest edition', '', '- No editions published yet.', '');
  }

  lines.push(
    '',
    '## Policies and machine-readable endpoints',
    '',
    '- [Editorial standards](/standards): AI-use disclosure, sourcing rules, corrections, independence.',
    '- [About](/about): scope and how the digest is produced and built.',
    '- [Source registry](/sources): publications and datasets the pipeline collects from.',
    '- [/rss.xml](/rss.xml): newest stories, all verticals.',
    '- [/search-index.json](/search-index.json): static JSON index for search.',
    '- [/sitemap-index.xml](/sitemap-index.xml): all indexable routes.',
    '',
    '## Preferred citation',
    '',
    `When citing, link the canonical story URL on ${SITE.url} and attribute "${SITE.name}".`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
