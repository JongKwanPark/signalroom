import type { APIRoute } from 'astro';
import { SITE } from '../../lib/site';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = () => {
  const siteHost = SITE.url.replace(/^https?:\/\//, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(SITE.name)} — ${escapeXml(SITE.tagline)}">
  <rect width="1200" height="630" fill="#0a0d12"/>
  <rect x="0" y="0" width="10" height="630" fill="#4cd1ee"/>
  <rect x="10" y="0" width="10" height="630" fill="#7fd497"/>
  <rect x="20" y="0" width="10" height="630" fill="#edb161"/>
  <rect x="30" y="0" width="10" height="630" fill="#c3aeff"/>
  <rect x="96" y="72" width="1008" height="1" fill="rgba(255,255,255,0.16)"/>
  <text x="96" y="60" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="26" letter-spacing="8" fill="#e8ecf1">SIGNAL ROOM</text>
  <text x="96" y="300" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="76" font-weight="650" fill="#e8ecf1">A daily intelligence digest.</text>
  <text x="96" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="40" fill="#9aa4b2">AI · Bio · Geopolitics · Markets</text>
  <text x="96" y="560" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" fill="#9aa4b2">AI-assisted drafts · editor-reviewed · primary sources cited inline</text>
  <text x="1104" y="560" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" fill="#9aa4b2">${escapeXml(siteHost)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
