#!/usr/bin/env node
// Build-time Open Graph images: satori (CSS layout -> SVG) + resvg (SVG -> PNG).
// Runs after `astro build` from `npm run build`; writes dist/og/site.png and
// dist/og/<slug>.png for every story. Fails the build on any bad output so we
// never silently ship blank or malformed share cards.

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

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

const VERTICALS = {
  ai: { label: 'AI', accent: '#4cd1ee' },
  bio: { label: 'BIO', accent: '#7fd497' },
  geo: { label: 'GEO', accent: '#edb161' },
  markets: { label: 'MARKETS', accent: '#c3aeff' },
};

const WORDMARK = 'SIGNAL ROOM';
const TAGLINE = 'A daily intelligence digest across AI, bio, geo and markets.';
const SITE_HOST = new URL(
  process.env.SITE_URL || process.env.SITE || 'https://signalroom.vercel.app',
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

function frame({ bars, label, labelColor, headline, footerLeft, footerRight }) {
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
      h('div', {
        position: 'absolute',
        top: 40,
        left: PAD,
        display: 'flex',
        fontFamily: 'JetBrains Mono',
        fontSize: 24,
        letterSpacing: 6,
        lineHeight: '30px',
        color: TEXT,
      }, WORDMARK),
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
          whiteSpace: 'pre',
          color: TEXT,
        }, line),
      )),
      h('div', {
        position: 'absolute',
        top: 552,
        left: PAD,
        display: 'flex',
        fontFamily: 'JetBrains Mono',
        fontSize: 22,
        lineHeight: '28px',
        color: MUTED,
      }, footerLeft),
      h('div', {
        position: 'absolute',
        top: 552,
        right: PAD,
        display: 'flex',
        fontFamily: 'JetBrains Mono',
        fontSize: 22,
        lineHeight: '28px',
        color: MUTED,
      }, footerRight),
    ],
  );
}

function storyElement(ref) {
  const vertical = VERTICALS[ref.vertical] ?? VERTICALS.ai;
  return frame({
    bars: [vertical.accent],
    label: `${vertical.label} — ${dateLabel(ref.date)} · ${timeLabel(ref.generatedAt)} UTC`,
    labelColor: vertical.accent,
    headline: wrap(clampText(ref.headline, 220), 36, 6),
    footerLeft: `${ref.sources} sources · ${ref.readMinutes} min`,
    footerRight: SITE_HOST,
  });
}

function siteElement(latestDate) {
  return frame({
    bars: [VERTICALS.ai.accent, VERTICALS.bio.accent, VERTICALS.geo.accent, VERTICALS.markets.accent],
    label: latestDate ? `DAILY DIGEST — ${dateLabel(latestDate)}` : 'DAILY DIGEST',
    labelColor: MUTED,
    headline: wrap(TAGLINE, 36, 6),
    footerLeft: 'AI-assisted drafts · editor-reviewed · sources cited',
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

  const seen = new Set();
  const refs = [];
  for (const edition of editions) {
    for (const story of edition.stories ?? []) {
      if (seen.has(story.slug)) continue;
      seen.add(story.slug);
      refs.push({
        slug: story.slug,
        headline: story.headline,
        readMinutes: story.readMinutes,
        sources: sourceCount(story),
        vertical: edition.vertical,
        date: edition.date,
        generatedAt: edition.generatedAt,
      });
    }
  }

  await mkdir(OUT_DIR, { recursive: true });

  const sitePng = await renderPng(siteElement(editions[0]?.date), fonts);
  assertPng(sitePng, 'site');
  await writeFile(path.join(OUT_DIR, 'site.png'), sitePng);

  await mapWithLimit(refs, 4, async (ref) => {
    const png = await renderPng(storyElement(ref), fonts);
    assertPng(png, ref.slug);
    await writeFile(path.join(OUT_DIR, `${ref.slug}.png`), png);
  });

  console.log(`[og] wrote site.png + ${refs.length} story PNGs to dist/og`);
}

await main();
