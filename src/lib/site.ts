export const SITE = {
  name: 'Signal Daily',
  tagline: 'A daily intelligence digest across AI, bio, geo and markets.',
  description:
    'Signal Daily is a public, no-login daily digest. Four verticals, one page: what moved, why it matters, and where it came from. AI-assisted drafting, editor-reviewed, primary sources cited inline.',
  url: (import.meta.env.SITE || 'https://www.signaldaily.cloud').replace(/\/+$/, ''),
  locale: 'en_US',
  author: 'Signal Daily editors',
} as const;

export const VERTICALS = ['ai', 'bio', 'geo', 'markets'] as const;
export type Vertical = (typeof VERTICALS)[number];

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
};

export const TYPES = ['BRIEF', 'DEEP', 'DATA'] as const;

export const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence',
};

export const HOME_INDEX_CAP = 14;
export const RSS_ITEM_CAP = 50;
export const SEARCH_RESULT_CAP = 8;

export function isVertical(value: string): value is Vertical {
  return (VERTICALS as readonly string[]).includes(value);
}
