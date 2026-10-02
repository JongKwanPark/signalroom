import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticleMarkdown } from '../scripts/validate-article.ts';

// Only Astro's collection I/O is substituted. All normalization/search/SEO code is real.
const contentUrl = `data:text/javascript,${encodeURIComponent(`
  export * as z from 'astro/zod';
  export { defineCollection } from 'astro/content/config';
  export async function getCollection(name, filter) {
    const entries = globalThis.__signalroomContentTestCollections[name] ?? [];
    return filter ? entries.filter(filter) : entries;
  }
`)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'astro:content') return { url: contentUrl, shortCircuit: true };
    if (context.parentURL === contentUrl) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !extname(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const article = async (name) => {
  const { data, body } = await parseArticleMarkdown(await readFile(new URL(`./fixtures/articles/valid/${name}.md`, import.meta.url), 'utf8'));
  return { id: name, collection: 'articles', data, body };
};
const articles = await Promise.all(['reflection.en', 'reflection.ko', 'draft', 'default-draft'].map(article));
const editionData = JSON.parse(await readFile(new URL('./fixtures/valid/sample-edition.json', import.meta.url), 'utf8'));
editionData.lang = 'en';
const editionEn = { id: 'fixture/ai', collection: 'editions', data: editionData };
const editionKo = structuredClone(editionEn);
editionKo.id = 'fixture/ai.ko';
editionKo.data.lang = 'ko';
editionKo.data.stories[0].slug += '-ko';
globalThis.__signalroomContentTestCollections = { editions: [editionEn, editionKo], articles };

const {
  allArticleRefs, allStoryRefs, combineStoryRefs, getEditions, getArticleRefs,
  getStoryRefs, getTranslationRef, toArticleRef, toStoryRef,
} = await import('../src/lib/editions.ts');
const { buildSearchIndex, buildSearchItem, searchIndex } = await import('../src/lib/search.ts');
const { articleJsonLd } = await import('../src/lib/seo.ts');
const { collections } = await import('../src/content.config.ts');
const ref = toArticleRef(articles[0]);

test('Astro collection and CLI share the exact standalone metadata schema and defaults', () => {
  const { draft, ...metadata } = articles[0].data;
  assert.equal(collections.articles.schema.parse(metadata).draft, true);
  assert.equal(collections.editions.schema.parse(editionEn.data).stories[0].publication, 'scheduled');
});

test('standalone normalization exposes render identity and empty news convenience fields', () => {
  assert.equal(ref.kind, 'article');
  assert.equal(ref.articleId, 'reflection.en');
  assert.equal(ref.editionId, undefined);
  assert.equal(ref.format, 'essay');
  assert.equal(ref.story.type, 'ESSAY');
  assert.equal(ref.author, 'Fixture Writer');
  assert.equal(ref.publication, 'manual');
  assert.equal(ref.href, '/en/story/test-reflection');
  assert.equal(ref.publishedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(ref.updatedAt, '2026-10-02T00:00:00.000Z');
  for (const field of ['tldr', 'body', 'cluster', 'sources']) assert.deepEqual(ref.story[field], []);
});

test('both explicit and default drafts are excluded from public refs, search and SEO inputs', async () => {
  assert.throws(() => toArticleRef(articles[2]), /Draft article/);
  assert.throws(() => toArticleRef(articles[3]), /Draft article/);
  assert.equal(allArticleRefs(articles, 'en').length, 1);
  assert.equal((await getArticleRefs('en')).length, 1);
  const refs = await getStoryRefs('en');
  assert.equal(refs.length, 2);
  assert.ok(refs.every((item) => !item.slug.includes('draft')));
  assert.ok(buildSearchIndex(refs).every((item) => !item.slug.includes('draft')));
  assert.ok(refs.map((item) => articleJsonLd(item)).every((item) => !item.url.includes('draft')));
});

test('getEditions/allStoryRefs stay edition-only and integrated refs sort publication time newest first', async () => {
  const editions = await getEditions();
  assert.equal(editions.length, 2);
  assert.ok(allStoryRefs(editions, 'en').every((item) => item.kind === 'edition'));
  const refs = await getStoryRefs('en');
  assert.deepEqual(refs.map((item) => item.kind), ['article', 'edition']);
  assert.equal(refs[1].editionId, editionEn.id);
  assert.equal(refs[1].publication, 'scheduled');
  const manual = toStoryRef(editionEn, { ...editionData.stories[0], publication: 'manual' });
  assert.equal(manual.publication, 'manual');
});

test('translation keys pair arbitrary article slugs and edition -ko convention remains intact', async () => {
  assert.equal((await getTranslationRef(ref, 'ko')).slug, 'test-seongchal');
  const ko = (await getArticleRefs('ko'))[0];
  assert.equal((await getTranslationRef(ko, 'en')).slug, 'test-reflection');
  assert.equal(await getTranslationRef({ ...ref, translationKey: undefined }, 'ko'), undefined);
  assert.equal(await getTranslationRef({ ...ref, translationKey: 'untranslated' }, 'ko'), undefined);
  assert.equal(await getTranslationRef(ref, 'en'), ref);
  const news = toStoryRef(editionEn, editionData.stories[0]);
  assert.equal((await getTranslationRef(news, 'ko')).slug, `${news.slug}-ko`);
});

test('crosscollection and standalone slug collisions fail with actionable identities within each language', () => {
  const news = toStoryRef(editionEn, editionData.stories[0]);
  assert.throws(() => combineStoryRefs([news], [{ ...ref, slug: news.slug }]), /slug collision.*en\/openai.*edition fixture\/ai and article reflection.en/);
  assert.throws(() => allArticleRefs([articles[0], { ...articles[0], id: 'duplicate', data: { ...articles[0].data, translationKey: undefined } }]), /slug collision/);
  assert.equal(combineStoryRefs([news], [{ ...ref, slug: news.slug, lang: 'ko' }]).length, 2);
});

test('duplicate translation keys per language fail while drafts cannot create ambiguity', () => {
  assert.throws(() => allArticleRefs([articles[0], { ...articles[0], id: 'duplicate-key', data: { ...articles[0].data, slug: 'distinct-slug' } }]), /Ambiguous article translationKey/);
  assert.equal(allArticleRefs([articles[0], { ...articles[0], data: { ...articles[0].data, draft: true } }]).length, 1);
});

test('invalid public metadata cannot normalize into a StoryRef', () => {
  assert.throws(() => toArticleRef({ ...articles[0], data: { ...articles[0].data, category: 'invalid' } }));
});

test('search registry carries article identity/timestamps and matches title, description, tags and author without tldr', () => {
  const item = buildSearchItem(ref);
  assert.equal(item.kind, 'article');
  assert.equal(item.slug, ref.slug);
  assert.equal(item.publication, 'manual');
  assert.equal(item.author, ref.author);
  assert.equal(item.publishedAt, ref.publishedAt);
  assert.equal(item.updatedAt, ref.updatedAt);
  assert.equal(item.generatedAt, ref.generatedAt);
  assert.deepEqual(item.tldr, []);
  for (const query of ['Fixture reflection', 'listening', 'philosophy', 'Writer']) {
    assert.equal(searchIndex([item], query, 8)[0]?.url, ref.href, query);
  }
});

test('SEO uses Article with named author and explicit dates, editions retain NewsArticle', () => {
  const data = articleJsonLd(ref);
  assert.equal(data['@type'], 'Article');
  assert.deepEqual(data.author, { '@type': 'Person', name: ref.author });
  assert.equal(data.datePublished, ref.publishedAt);
  assert.equal(data.dateModified, ref.updatedAt);
  assert.ok(data.wordCount > 0);
  const news = articleJsonLd(toStoryRef(editionEn, editionData.stories[0]));
  assert.equal(news['@type'], 'NewsArticle');
  assert.equal(news.author['@type'], 'NewsMediaOrganization');
});


test('real Astro glob ingestion retains colliding slugs for language-scoped validation', async () => {
  const root = new URL('./fixtures/articles/loader/', import.meta.url);
  const entries = new Map();
  const warnings = [];
  await collections.articles.loader.load({
    collection: 'articles',
    config: { root, srcDir: new URL('src/', root), prerenderConflictBehavior: 'error' },
    logger: { warn: (message) => warnings.push(message), error: (message) => assert.fail(message), info() {} },
    store: { keys: () => entries.keys(), get: (id) => entries.get(id), set: (entry) => entries.set(entry.id, entry), delete: (id) => entries.delete(id) },
    parseData: ({ data }) => collections.articles.schema.parse(data),
    generateDigest: (raw) => raw,
    entryTypes: new Map([['.md', { getEntryInfo: async ({ contents }) => {
      const { data, body } = await parseArticleMarkdown(contents);
      return { data, body };
    } }]]),
  });
  assert.deepEqual(warnings, []);
  assert.equal(entries.size, 3);
  const loaded = [...entries.values()].map((entry) => ({ ...entry, collection: 'articles' }));
  assert.throws(() => allArticleRefs(loaded, 'en'), /Public story slug collision/);
  assert.equal(allArticleRefs(loaded, 'ko').length, 1);
  assert.equal(allArticleRefs(loaded.filter((entry) => entry.id !== 'duplicate.en'), 'en').length, 1);
  assert.equal(allArticleRefs(loaded, 'ko')[0].articleId, 'same.ko');
});
