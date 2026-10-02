// Pure category definitions shared by the web and the automated pipeline.
export const CATEGORY_KEYS = ['ai', 'bio', 'geo', 'markets', 'wisdom', 'society'] as const;
export const AUTOMATED_VERTICALS = ['ai', 'bio', 'geo', 'markets'] as const;
export const VERTICALS = CATEGORY_KEYS;
export type Vertical = (typeof CATEGORY_KEYS)[number];
export type AutomatedVertical = (typeof AUTOMATED_VERTICALS)[number];

export interface VerticalMeta {
  key: Vertical;
  label: string;
  name: string;
  blurb: string;
  feedTitle: string;
  defaultView: 'list' | 'timeline';
}

export const VERTICAL_META: Record<Vertical, VerticalMeta> = {
  ai: {
    key: 'ai',
    label: 'AI',
    name: 'Artificial intelligence',
    blurb: 'Models, compute, policy and the industrial race.',
    feedTitle: 'AI signal',
    defaultView: 'list',
  },
  bio: {
    key: 'bio',
    label: 'BIO',
    name: 'Bio & health',
    blurb: 'Trials, approvals, platforms and the business of biology.',
    feedTitle: 'Bio signal',
    defaultView: 'list',
  },
  geo: {
    key: 'geo',
    label: 'GEO',
    name: 'Geopolitics & security',
    blurb: 'Power, conflict, supply chains and statecraft.',
    feedTitle: 'Geo signal',
    defaultView: 'timeline',
  },
  markets: {
    key: 'markets',
    label: 'MARKETS',
    name: 'Markets & macro',
    blurb: 'Rates, energy, earnings and the flows that move them.',
    feedTitle: 'Markets signal',
    defaultView: 'timeline',
  },
  wisdom: {
    key: 'wisdom',
    label: 'WISDOM',
    name: 'Philosophy & reflection',
    blurb: 'Classics, philosophy and reflections on living.',
    feedTitle: 'Wisdom signal',
    defaultView: 'list',
  },
  society: {
    key: 'society',
    label: 'SOCIETY',
    name: 'Society & culture',
    blurb: 'Culture, education, work and our shared lives.',
    feedTitle: 'Society signal',
    defaultView: 'list',
  },
};

export function isVertical(value: unknown): value is Vertical {
  return typeof value === 'string' && (CATEGORY_KEYS as readonly string[]).includes(value);
}
