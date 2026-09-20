import { SITE, VERTICAL_META } from './site';
import type { StoryRef } from './editions';

export type JsonLd = Record<string, unknown>;

export function canonicalUrl(pathname: string): string {
  const withSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const normalized = withSlash === '/' ? '/' : withSlash.replace(/\/+$/, '');
  return new URL(normalized, `${SITE.url}/`).href;
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, `${SITE.url}/`).href;
}

export function publisherJsonLd(): JsonLd {
  return {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: publisherJsonLd(),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/search?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleJsonLd(ref: StoryRef, options?: { image?: string }): JsonLd {
  const { story, vertical, date } = ref;
  const description = story.dek ?? story.tldr[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: story.headline,
    description,
    url: absoluteUrl(ref.href),
    mainEntityOfPage: absoluteUrl(ref.href),
    datePublished: dateIso(ref.generatedAt, date),
    dateModified: ref.generatedAt,
    articleSection: VERTICAL_META[vertical].name,
    keywords: story.tags.join(', '),
    wordCount: story.body.reduce((total, block) => total + block.text.split(/\s+/).length, 0),
    timeRequired: `PT${story.readMinutes}M`,
    author: publisherJsonLd(),
    publisher: publisherJsonLd(),
    isAccessibleForFree: true,
    ...(options?.image ? { image: absoluteUrl(options.image) } : {}),
    citation: story.sources.map((source) => ({
      '@type': 'CreativeWork',
      name: source.title ?? source.source,
      url: source.url,
    })),
  };
}

function dateIso(generatedAt: string, fallbackDate: string): string {
  const parsed = new Date(generatedAt);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return `${fallbackDate}T00:00:00.000Z`;
}

export function itemListJsonLd(refs: StoryRef[], name: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: refs.length,
    itemListElement: refs.map((ref, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(ref.href),
      name: ref.story.headline,
    })),
  };
}
