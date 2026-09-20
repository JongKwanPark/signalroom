import type { APIRoute, GetStaticPaths } from 'astro';
import { getStoryRefs, sourceCount, timeLabel, type StoryRef } from '../../lib/editions';
import { VERTICAL_META } from '../../lib/site';
import { formatDateLong } from '../../lib/format';

export const getStaticPaths: GetStaticPaths = async () => {
  const refs = await getStoryRefs();
  return refs.map((ref) => ({ params: { slug: ref.slug }, props: { ref } }));
};

const ACCENT_HEX: Record<string, string> = {
  ai: '#4cd1ee',
  bio: '#7fd497',
  geo: '#edb161',
  markets: '#c3aeff',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

export const GET: APIRoute = async ({ props }) => {
  const { ref } = props as { ref: StoryRef };
  const { story, vertical } = ref;
  const accent = ACCENT_HEX[vertical] ?? ACCENT_HEX.ai;
  const siteHost = 'signalroom.vercel.app';

  const headlineLines = wrap(story.headline, 32, 4);
  const headline = headlineLines
    .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 76}">${escapeXml(line)}</tspan>`)
    .join('');

  const meta = [
    VERTICAL_META[vertical].label,
    story.type,
    formatDateLong(ref.date),
    timeLabel(ref.generatedAt) + ' UTC',
    `${sourceCount(story)} sources`,
    `${story.readMinutes} min`,
  ]
    .map(escapeXml)
    .join('  ·  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(story.headline)}">
  <rect width="1200" height="630" fill="#0a0d12"/>
  <rect x="0" y="0" width="10" height="630" fill="${accent}"/>
  <rect x="96" y="72" width="1008" height="1" fill="rgba(255,255,255,0.16)"/>
  <text x="96" y="60" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="24" letter-spacing="6" fill="#e8ecf1">SIGNAL ROOM</text>
  <text x="1104" y="60" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" letter-spacing="4" fill="${accent}">${escapeXml(VERTICAL_META[vertical].label)}</text>
  <text x="96" y="248" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="64" font-weight="650" fill="#e8ecf1">${headline}</text>
  <text x="96" y="560" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" fill="#9aa4b2">${meta}</text>
  <text x="1104" y="560" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" fill="#9aa4b2">${escapeXml(siteHost)}/story/${escapeXml(ref.slug)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
