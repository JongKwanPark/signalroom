// Signal Daily — logo generator (contest submission, brand/logo-contest/qwen)
// Produces logo-mark.svg, logo-primary.svg, logo-mono.svg, preview.png.
// Wordmark outlines come from the repo's bundled Inter TTFs via satori (same
// text-to-path pipeline as scripts/og.mjs); the wave is a numeric offset of a
// point-symmetric cubic S so the same geometry works as fill and as knockout.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = HERE;

// ---- tokens (docs/design-system.md §2) ----
const CANVAS = '#0a0d12';
const CANVAS_LIGHT = '#f6f7f9';
const SURFACE2 = '#121722';
const TEXT = '#e8ecf1';
const MUTED = '#9aa4b2';
const INK = '#10151c';
const MUTED_LIGHT = '#4b5563';
const HAIRLINE_STRONG = 'rgba(255,255,255,0.16)';
const HAIRLINE_LIGHT = 'rgba(10,13,18,0.20)';
const ACCENTS = ['#4cd1ee', '#7fd497', '#edb161', '#c3aeff'];

// ---- wave geometry (24-unit grid, butt caps, radius 0) ----
const HALF = 1.6;
const SEGS = [
  { p0: [16.5, 5], c1: [9, 5], c2: [7.5, 9.75], p3: [12, 12] },
  { p0: [12, 12], c1: [16.5, 14.25], c2: [15, 19], p3: [7.5, 19] },
];
const at = (s, t) => {
  const u = 1 - t;
  const x = u * u * u * s.p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p3[0];
  const y = u * u * u * s.p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p3[1];
  return [x, y];
};
const tangent = (s, t) => {
  const u = 1 - t;
  const x = 3 * u * u * (s.c1[0] - s.p0[0]) + 6 * u * t * (s.c2[0] - s.c1[0]) + 3 * t * t * (s.p3[0] - s.c2[0]);
  const y = 3 * u * u * (s.c1[1] - s.p0[1]) + 6 * u * t * (s.c2[1] - s.c1[1]) + 3 * t * t * (s.p3[1] - s.c2[1]);
  return [x, y];
};
const N = 96;
const spine = [];
for (const [si, s] of SEGS.entries()) {
  for (let i = si ? 1 : 0; i <= N; i++) spine.push({ s, t: i / N });
}
const r2 = (v) => Math.round(v * 100) / 100;
const outer = [];
const inner = [];
for (const { s, t } of spine) {
  const [x, y] = at(s, t);
  const [tx, ty] = tangent(s, t);
  const m = Math.hypot(tx, ty);
  const nx = ty / m;
  const ny = -tx / m;
  outer.push([x + nx * HALF, y + ny * HALF]);
  inner.push([x - nx * HALF, y - ny * HALF]);
}
const pts = (arr) => arr.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L ');
const WAVE = `M ${pts(outer)} L ${pts(inner.slice().reverse())} Z`;

const TILE = 'M0 0 H24 V24 H0 Z';

// ---- wordmark outlines via satori (Inter SemiBold + Inter Regular) ----
const opts = {
  width: 400,
  height: 40,
  fonts: [
    { name: 'ISB', data: readFileSync(path.join(ROOT, 'src/assets/fonts/Inter-SemiBold.ttf')), weight: 600 },
    { name: 'IR', data: readFileSync(path.join(ROOT, 'src/assets/fonts/Inter-Regular.ttf')), weight: 400 },
  ],
  textColor: TEXT,
};
const run = (text, family, color) => ({
  type: 'span',
  props: {
    style: {
      display: 'flex',
      flexDirection: 'row',
      fontSize: 17,
      fontFamily: family,
      letterSpacing: '-0.255px',
      color,
    },
    children: text,
  },
});
const extract = (svg) => {
  const out = [];
  const re = /<path fill="([^"]+)" d="([^"]+)"/g;
  let m;
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  while ((m = re.exec(svg))) {
    out.push({ fill: m[1], d: m[2] });
    const nums = m[2].match(/-?[\d.]+/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      minX = Math.min(minX, nums[i]);
      maxX = Math.max(maxX, nums[i]);
      minY = Math.min(minY, nums[i + 1]);
      maxY = Math.max(maxY, nums[i + 1]);
    }
  }
  return { out, x0: minX, y0: minY, w: maxX - minX, h: maxY - minY };
};
const FS = 17;
const a = extract(await satori({ type: 'div', props: { style: { display: 'flex', flexDirection: 'row' }, children: [run('Signal', 'ISB', TEXT)] } }, opts));
const b = extract(await satori({ type: 'div', props: { style: { display: 'flex', flexDirection: 'row' }, children: [run('Daily', 'IR', MUTED)] } }, opts));

const GAP_X = 8;
const X1 = 24 + GAP_X;
const bottom = Math.max(a.y0 + a.h, b.y0 + b.h);
const WORD_Y = r2(12 + 6.18 - (bottom - 3.7)); // align cap-height center to wave center (baseline = bottom - descender)
const X2 = r2(X1 + a.w + 4.5);
const LOCK_W = r2(X2 + b.w + 2);
const paths = (box, x) => box.out.map((p) => `    <path transform="translate(${r2(x - box.x0)} ${WORD_Y})" fill="${p.fill}" fill-rule="nonzero" d="${p.d}"/>`).join('\n');

const header = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;

// ---- logo-mark.svg : tile + wave, square ----
const mark = `${header(24, 24)}
  <title>Signal Daily</title>
  <path fill="${CANVAS}" d="${TILE}"/>
  <path fill="${HAIRLINE_STRONG}" fill-rule="evenodd" d="M0.5 0.5 H23.5 V23.5 H0.5 Z M1.5 1.5 H22.5 V22.5 H1.5 Z"/>
  <path fill="${TEXT}" d="${WAVE}"/>
</svg>
`;

// ---- logo-primary.svg : horizontal lockup, dark-first canonical ----
const primary = `${header(LOCK_W, 24)}
  <title>Signal Daily</title>
  <path fill="${CANVAS}" d="${TILE}"/>
  <path fill="${HAIRLINE_STRONG}" fill-rule="evenodd" d="M0.5 0.5 H23.5 V23.5 H0.5 Z M1.5 1.5 H22.5 V22.5 H1.5 Z"/>
  <path fill="${TEXT}" d="${WAVE}"/>
${paths(a, X1)}
${paths(b, X2)}
</svg>
`;

// ---- logo-mono.svg : single color via currentColor, tile-knockout wave ----
const mono = `${header(LOCK_W, 24)}
  <title>Signal Daily</title>
  <path fill="currentColor" fill-rule="evenodd" d="${TILE} ${WAVE}"/>
  <g fill="currentColor">
${paths(a, X1).replace(/ fill="[^"]+"/g, '').replace('transform=', 'transform=')}
${paths(b, X2).replace(/ fill="[^"]+"/g, '')}
  </g>
</svg>
`;

writeFileSync(path.join(OUT, 'logo-mark.svg'), mark);
writeFileSync(path.join(OUT, 'logo-primary.svg'), primary);
writeFileSync(path.join(OUT, 'logo-mono.svg'), mono);

// ---- preview.png : render SVGs side by side on dark + light canvases ----
const inner0 = (svg) => svg.replace(/<svg[^>]*>|<\/svg>|<title>[^<]*<\/title>/g, '').trim();
const markBody = inner0(mark);
const monoBody = inner0(mono);
const cap = (x, y, t, fill) => `  <text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="11" letter-spacing="1" fill="${fill}">${t}</text>\n`;

let P = '';
const PW = 1080;
const PH = 760;
const pad = 24;
P += header(PW, PH);
P += `  <path fill="${CANVAS}" d="M0 0 H1080 V760 H0 Z"/>\n`;

// row 1: primary lockup on canvas (dark-first), mark+mono on light
P += `  <rect x="${pad}" y="${pad}" width="1032" height="150" fill="${CANVAS}" stroke="${HAIRLINE_STRONG}"/>\n`;
P += `<svg x="${pad + 40}" y="${pad + 40}" width="${(LOCK_W * 2.6).toFixed(1)}" height="62.4" viewBox="0 0 ${LOCK_W} 24">`;
P += paths0(primary);
P += `</svg>\n`;
P += cap(pad + 4, pad + 14, 'LOGO-PRIMARY — CANVAS (DARK-FIRST)', MUTED);

P += `  <rect x="${pad}" y="${pad + 166}" width="1032" height="150" fill="${CANVAS_LIGHT}" stroke="${HAIRLINE_LIGHT}"/>\n`;
P += `<svg x="${pad + 40}" y="${pad + 206}" width="${(LOCK_W * 2.6).toFixed(1)}" height="62.4" viewBox="0 0 ${LOCK_W} 24">`;
P += monoLockup(INK);
P += `</svg>\n`;
P += cap(pad + 4, pad + 180, 'LOGO-MONO — CANVAS LIGHT (CURRENTCOLOR = TEXT LIGHT)', MUTED_LIGHT);

// row 2: mark at sizes, light bg
P += `  <rect x="${pad}" y="${pad + 332}" width="508" height="200" fill="${SURFACE2}" stroke="${HAIRLINE_STRONG}"/>\n`;
P += cap(pad + 4, pad + 346, 'LOGO-MARK — 96 / 32 / 24 / 16 PX', MUTED);
let x = pad + 40;
for (const s of [96, 32, 24, 16]) {
  P += `<svg x="${x}" y="${pad + 392}" width="${s}" height="${s}" viewBox="0 0 24 24">${markBody}</svg>\n`;
  x += s + 40;
}

// row 2 right: vertical-accent variants of the mark
P += `  <rect x="${pad + 524}" y="${pad + 332}" width="508" height="200" fill="${SURFACE2}" stroke="${HAIRLINE_STRONG}"/>\n`;
P += cap(pad + 528, pad + 346, 'ACCENT SLOT — 4 VERTICAL HUES (MARK ON 24PX TILES)', MUTED);
x = pad + 564;
for (const c of ACCENTS) {
  P += `<svg x="${x}" y="${pad + 402}" width="80" height="80" viewBox="0 0 24 24">${markBody.replace(`fill="${TEXT}" d="${WAVE}"`, `fill="${c}" d="${WAVE}"`)}</svg>\n`;
  x += 112;
}

// row 3: mono on light canvas, small
P += `  <rect x="${pad}" y="${pad + 548}" width="1032" height="188" fill="${CANVAS_LIGHT}" stroke="${HAIRLINE_LIGHT}"/>\n`;
P += cap(pad + 4, pad + 562, 'LOGO-MONO — SINGLE COLOR, KNOCKOUT TILE (CURRENTCOLOR = TEXT DARK)', MUTED_LIGHT);
P += `<svg x="${pad + 40}" y="${pad + 600}" width="${(LOCK_W * 2.2).toFixed(1)}" height="52.8" viewBox="0 0 ${LOCK_W} 24">${monoLockup(INK)}</svg>\n`;
P += `<svg x="${pad + 40}" y="${pad + 668}" width="36" height="36" viewBox="0 0 24 24"><path fill="${INK}" fill-rule="evenodd" d="${TILE} ${WAVE}"/></svg>\n`;
P += `<svg x="${pad + 96}" y="${pad + 676}" width="24" height="24" viewBox="0 0 24 24"><path fill="${INK}" fill-rule="evenodd" d="${TILE} ${WAVE}"/></svg>\n`;
P += `<svg x="${pad + 136}" y="${pad + 684}" width="16" height="16" viewBox="0 0 24 24"><path fill="${INK}" fill-rule="evenodd" d="${TILE} ${WAVE}"/></svg>\n`;

P += '</svg>\n';
writeFileSync('/tmp/preview-composite.svg', P);

function paths0(svg) {
  return svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').replace(/<title>[\s\S]*?<\/title>/g, '').trim();
}
function monoLockup(hex) {
  return monoBody.replaceAll('currentColor', hex).replace(`transform="translate(${X1}`, `transform="translate(${X1}`);
}

const png = new Resvg(P, {
  background: 'white',
  font: {
    fontFiles: {
      'JetBrains Mono': path.join(ROOT, 'src/assets/fonts/JetBrainsMono-Regular.ttf'),
    },
    loadSystemFonts: true,
    defaultFontFamily: 'JetBrains Mono',
  },
}).render().asPng();
writeFileSync(path.join(OUT, 'preview.png'), png);
console.log('lockup viewBox', LOCK_W, 'x24 — word boxes', a.w, a.h, '/', b.w, b.h);
console.log('preview.png', png.length, 'bytes');
