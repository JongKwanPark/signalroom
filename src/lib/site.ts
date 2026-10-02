export const SITE = {
  name: 'Signal Daily',
  tagline: 'Understand the world. Understand yourself.',
  taglineKo: '세상을 이해하고, 자신을 이해하다.',
  description:
    'Signal Daily brings together AI-assisted daily news and authored features, essays and reflection across six categories. Public, no login, with sources cited for reported facts.',
  url: (import.meta.env?.SITE || 'https://signaldaily.cloud').replace(/\/+$/, ''),
  author: 'Signal Daily editors',
} as const;

export const LOCALE = { en: 'en_US', ko: 'ko_KR' } as const;

export { CATEGORY_KEYS, AUTOMATED_VERTICALS, VERTICALS, VERTICAL_META, isVertical } from './categories.ts';
export type { Vertical, VerticalMeta, AutomatedVertical } from './categories.ts';

export const TYPES = ['BRIEF', 'DEEP', 'DATA'] as const;

export const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence',
};

export const HOME_INDEX_CAP = 14;
export const RSS_ITEM_CAP = 50;
export const SEARCH_RESULT_CAP = 8;
