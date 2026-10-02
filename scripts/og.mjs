#!/usr/bin/env node
// Build-time Open Graph images: satori (CSS layout -> SVG) + resvg (SVG -> PNG).
// Runs after `astro build` from `npm run build`; writes dist/og/site.png and
// dist/og/<lang>/<slug>.png for every story. Fails the build on any bad output so we
// never silently ship blank or malformed share cards.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { SITE, CATEGORY_KEYS, VERTICAL_META } from '../src/lib/site.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'src/content/editions');
const FONT_DIR = path.join(ROOT, 'src/assets/fonts');
const OUT_DIR = path.join(ROOT, 'dist/og');

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 96;
const CONTENT_WIDTH = WIDTH - PAD * 2;

const CANVAS = '#0a0d12';
const TEXT = '#e8ecf1';
const MUTED = '#9aa4b2';
const HAIRLINE = 'rgba(255,255,255,0.16)';

const THEME = readFileSync(path.join(ROOT, 'src/styles/theme.css'), 'utf8');
const VERTICALS = Object.fromEntries(CATEGORY_KEYS.map((key) => {
  const accent = THEME.match(new RegExp(`--accent-${key}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'))?.[1];
  if (!accent) throw new Error(`[og] missing dark accent token for ${key}`);
  return [key, { label: VERTICAL_META[key].label, accent }];
}));

const MARK_DATA_URI = `data:image/svg+xml;base64,${readFileSync(
  path.join(ROOT, 'public/brand/logo-mark.svg'),
).toString('base64')}`;
const TAGLINE = SITE.tagline;
const TAGLINE_KO = SITE.taglineKo;
const SITE_HOST = new URL(
  process.env.SITE_URL || process.env.SITE || 'https://signaldaily.cloud',
).host;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const clampText = (text, maxChars) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

// Deterministic greedy wrap: satori re-wraps text on its own, so we pre-split
// into lines it will not need to break again (conservative chars-per-line).
const wrap = (text, maxChars, maxLines) => {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (`${last}…`.length > maxChars && last.includes(' ')) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
};

// Korean headlines need more flexible breaks than space-delimited English text.
const wrapKorean = (text, maxChars = 22, maxLines = 5) => {
  const chars = Array.from(String(text).replace(/\s+/g, ' ').trim());
  const lines = [];
  while (chars.length && lines.length < maxLines) {
    if (chars.length <= maxChars) {
      lines.push(chars.splice(0).join(''));
      break;
    }
    const candidate = chars.slice(0, maxChars);
    const space = candidate.lastIndexOf(' ');
    const count = space >= Math.floor(maxChars / 2) ? space + 1 : maxChars;
    lines.push(chars.splice(0, count).join('').trim());
    while (chars[0] === ' ') chars.shift();
  }
  if (chars.length && lines.length) lines[lines.length - 1] = `${Array.from(lines[lines.length - 1]).slice(0, maxChars - 1).join('').trimEnd()}…`;
  return lines;
};

const dateLabel = (date) => {
  const [year, month, day] = String(date).split('-');
  const index = Number(month) - 1;
  if (!year || !MONTHS[index] || !day) return date;
  return `${MONTHS[index]} ${Number(day)}, ${year}`;
};

const timeLabel = (iso) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}`;
};

const sourceCount = (story) => {
  const hosts = new Set();
  for (const source of story.sources ?? []) {
    try {
      hosts.add(new URL(source.url).hostname);
    } catch {
      hosts.add(source.source);
    }
  }
  return hosts.size;
};

const h = (type, style, children) => ({ type, props: { style, children } });

// Brand lockup: wave mark tile + "Signal Daily" in the bundled Inter faces,
// matching the shipped lockup (SemiBold --text + Regular --muted).
function brandLockup() {
  return h(
    'div',
    { position: 'absolute', top: 40, left: PAD, display: 'flex', alignItems: 'center', gap: 12 },
    [
      { type: 'img', props: { src: MARK_DATA_URI, width: 28, height: 28 } },
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 7,
          fontFamily: 'Inter',
          fontSize: 26,
          lineHeight: '28px',
          letterSpacing: '-0.4px',
        },
        [
          h('div', { display: 'flex', fontWeight: 600, color: TEXT }, 'Signal'),
          h('div', { display: 'flex', fontWeight: 400, color: MUTED }, 'Daily'),
        ],
      ),
    ],
  );
}

function frame({ bars, label, labelColor, headline, footerLeft, footerRight, lang = 'en' }) {
  return h(
    'div',
    {
      display: 'flex',
      position: 'relative',
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: CANVAS,
      fontFamily: 'Inter',
    },
    [
      ...bars.map((color, index) =>
        h('div', {
          position: 'absolute',
          top: 0,
          left: index * 10,
          width: 10,
          height: HEIGHT,
          backgroundColor: color,
        }),
      ),
      brandLockup(),
      h('div', {
        position: 'absolute',
        top: 84,
        left: PAD,
        width: CONTENT_WIDTH,
        height: 1,
        backgroundColor: HAIRLINE,
      }),
      h('div', {
        position: 'absolute',
        top: 112,
        left: PAD,
        display: 'flex',
        fontFamily: 'JetBrains Mono',
        fontSize: 26,
        letterSpacing: 5,
        lineHeight: '32px',
        color: labelColor,
      }, label),
      h('div', {
        position: 'absolute',
        top: 168,
        left: PAD,
        width: CONTENT_WIDTH,
        display: 'flex',
        flexDirection: 'column',
      }, headline.map((line) =>
        h('div', {
          display: 'flex',
          fontSize: 48,
          fontWeight: 600,
          lineHeight: '60px',
          fontFamily: lang === 'ko' ? 'Noto Sans KR' : 'Inter',
          whiteSpace: 'pre',
          color: TEXT,
        }, line),
      )),
      h('div', {
        position: 'absolute',
        top: 552,
        left: PAD,
        right: PAD,
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'JetBrains Mono',
        fontSize: 20,
        lineHeight: '28px',
        color: MUTED,
      }, [
        h('div', { display: 'flex' }, footerLeft),
        h('div', { display: 'flex' }, footerRight),
      ]),
    ],
  );
}

function storyElement(ref) {
  const vertical = VERTICALS[ref.vertical] ?? VERTICALS.ai;
  return frame({
    bars: [vertical.accent],
    label: `${vertical.label} — ${dateLabel(ref.date)} · ${timeLabel(ref.generatedAt)} UTC`,
    labelColor: vertical.accent,
    headline: ref.lang === 'ko' ? wrapKorean(ref.headline) : wrap(clampText(ref.headline, 220), 36, 6),
    lang: ref.lang,
    footerLeft: ref.kind === 'article'
      ? `${ref.author || 'Signal Daily'} · ${ref.readMinutes} min`
      : `${ref.sources} sources · ${ref.readMinutes} min`,
    footerRight: SITE_HOST,
  });
}

function siteElement(latestDate, lang = 'en') {
  return frame({
    bars: Object.values(VERTICALS).map((vertical) => vertical.accent),
    label: latestDate ? `SIGNAL DAILY — ${dateLabel(latestDate)}` : 'SIGNAL DAILY',
    labelColor: MUTED,
    headline: lang === 'ko' ? wrapKorean(TAGLINE_KO) : wrap(TAGLINE, 36, 6),
    lang,
    footerLeft: 'Daily news · essays · reflection',
    footerRight: SITE_HOST,
  });
}

async function loadFonts() {
  const read = async (file) => {
    const buffer = await readFile(path.join(FONT_DIR, file));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };
  return [
    { name: 'Inter', data: await read('Inter-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'Inter', data: await read('Inter-SemiBold.ttf'), weight: 600, style: 'normal' },
    { name: 'Noto Sans KR', data: await read('NotoSansKR-Bold.otf'), weight: 600, style: 'normal' },
    {
      name: 'JetBrains Mono',
      data: await read('JetBrainsMono-Regular.ttf'),
      weight: 400,
      style: 'normal',
    },
  ];
}

async function loadEditions() {
  if (!existsSync(CONTENT_DIR)) return [];
  const editions = [];
  for (const entry of await readdir(CONTENT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(path.join(CONTENT_DIR, entry.name))) {
      if (!file.endsWith('.json')) continue;
      editions.push(JSON.parse(await readFile(path.join(CONTENT_DIR, entry.name, file), 'utf8')));
    }
  }
  return editions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// Astro's search indexes use the same published-content query as the pages.
// Reading them avoids a second Markdown parser and keeps drafts out of OG output.
async function loadPublicRefs(editions) {
  const newsMetadata = new Map();
  for (const edition of editions) {
    const lang = edition.lang === 'ko' ? 'ko' : 'en';
    for (const story of edition.stories ?? []) {
      const key = `${lang}:${story.slug}`;
      if (!newsMetadata.has(key)) {
        newsMetadata.set(key, { generatedAt: edition.generatedAt, sources: sourceCount(story) });
      }
    }
  }
  const refs = [];
  for (const lang of ['en', 'ko']) {
    const indexPath = path.join(ROOT, 'dist', lang, 'search-index.json');
    const items = JSON.parse(await readFile(indexPath, 'utf8'));
    for (const item of items) {
      const match = item.url?.match(/^\/(en|ko)\/story\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
      if (!match || match[1] !== lang) {
        throw new Error(`[og] invalid published story URL in ${indexPath}: ${item.url}`);
      }
      const metadata = newsMetadata.get(`${lang}:${match[2]}`);
      refs.push({
        lang,
        slug: match[2],
        kind: item.kind ?? 'edition',
        author: item.author,
        headline: item.headline,
        readMinutes: item.readMinutes,
        sources: metadata?.sources ?? item.sources,
        vertical: item.vertical,
        date: item.date,
        generatedAt: item.publishedAt ?? item.generatedAt ?? metadata?.generatedAt ?? `${item.date}T00:00:00Z`,
      });
    }
  }
  return refs;
}

async function renderPng(element, fonts) {
  const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts });
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render();
  return Buffer.from(rendered.asPng());
}

function assertPng(buffer, label) {
  const isPng = buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!isPng) throw new Error(`[og] ${label}: output is not a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`[og] ${label}: expected ${WIDTH}x${HEIGHT}, got ${width}x${height}`);
  }
  if (buffer.length < 4096) {
    throw new Error(`[og] ${label}: PNG is suspiciously small (${buffer.length} bytes)`);
  }
}

async function mapWithLimit(items, limit, task) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!existsSync(FONT_DIR)) {
    throw new Error(`[og] fonts missing at ${FONT_DIR}; cannot render text`);
  }
  const fonts = await loadFonts();
  const editions = await loadEditions();
  const refs = await loadPublicRefs(editions);

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.join(OUT_DIR, 'en'), { recursive: true });
  await mkdir(path.join(OUT_DIR, 'ko'), { recursive: true });

  const sitePng = await renderPng(siteElement(editions[0]?.date), fonts);
  assertPng(sitePng, 'site');
  await writeFile(path.join(OUT_DIR, 'site.png'), sitePng);
  await writeFile(path.join(OUT_DIR, 'en/site.png'), sitePng);
  const koSitePng = await renderPng(siteElement(editions.find((edition) => edition.lang === 'ko')?.date, 'ko'), fonts);
  assertPng(koSitePng, 'ko/site');
  await writeFile(path.join(OUT_DIR, 'ko/site.png'), koSitePng);

  await mapWithLimit(refs, 4, async (ref) => {
    const png = await renderPng(storyElement(ref), fonts);
    assertPng(png, `${ref.lang}/${ref.slug}`);
    await writeFile(path.join(OUT_DIR, ref.lang, `${ref.slug}.png`), png);
    if (ref.lang === 'en') await writeFile(path.join(OUT_DIR, `${ref.slug}.png`), png);
  });

  console.log(`[og] wrote en/ko site.png + ${refs.length} story PNGs to dist/og`);
}

await main();
