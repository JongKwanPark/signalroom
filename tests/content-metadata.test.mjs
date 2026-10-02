import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { CATEGORY_KEYS, AUTOMATED_VERTICALS, VERTICAL_META } from '../src/lib/categories.ts';
import { articleMetadataSchema, parseArticleMarkdown, validateArticleData, validateArticleFile, validateArticlePath } from '../scripts/validate-article.ts';
import { validateEditionData } from '../scripts/validate.ts';

const fixture = (path) => new URL(`./fixtures/articles/${path}`, import.meta.url);
const publicData = (await parseArticleMarkdown(await readFile(fixture('valid/reflection.en.md'), 'utf8'))).data;
const editionData = JSON.parse(await readFile(new URL('./fixtures/valid/sample-edition.json', import.meta.url), 'utf8'));
editionData.lang = 'en';

test('six web categories and exactly four automated categories share one source', () => {
  assert.deepEqual(CATEGORY_KEYS, ['ai', 'bio', 'geo', 'markets', 'wisdom', 'society']);
  assert.deepEqual(AUTOMATED_VERTICALS, ['ai', 'bio', 'geo', 'markets']);
  assert.deepEqual(Object.keys(VERTICAL_META), [...CATEGORY_KEYS]);
});

test('all six categories accept manual edition stories without weakening news gates', () => {
  for (const vertical of CATEGORY_KEYS) {
    const data = structuredClone(editionData);
    data.vertical = vertical;
    data.stories[0].publication = 'manual';
    assert.deepEqual(validateEditionData(data), [], vertical);
    data.stories[0].tldr = [];
    assert.ok(validateEditionData(data).some((issue) => issue.path.endsWith('.tldr')));
  }
  const data = structuredClone(editionData);
  data.stories[0].publication = 'unknown';
  assert.ok(validateEditionData(data).some((issue) => issue.path.endsWith('.publication')));
});

test('standalone metadata allows each format without any news convenience fields', () => {
  for (const format of ['essay', 'feature', 'analysis']) {
    for (const category of CATEGORY_KEYS) {
      assert.deepEqual(validateArticleData({ ...publicData, format, category }), []);
    }
  }
  assert.equal('tldr' in publicData, false);
  assert.deepEqual(publicData.sources, []);
});

test('draft defaults true and cannot be coerced from a string', () => {
  const { draft, ...withoutDraft } = publicData;
  assert.equal(articleMetadataSchema.parse(withoutDraft).draft, true);
  assert.ok(validateArticleData({ ...publicData, draft: 'false' }).some((issue) => issue.path === 'draft'));
});

test('YAML dates normalize to ISO and invalid dates or reversed modification times fail', () => {
  assert.equal(publicData.publishedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(publicData.updatedAt, '2026-10-02T00:00:00.000Z');
  for (const publishedAt of ['2026-02-30', 'not-a-date', '2026-10-01T10:00:00']) {
    assert.ok(validateArticleData({ ...publicData, publishedAt }).some((issue) => issue.path === 'publishedAt'));
  }
  assert.ok(validateArticleData({ ...publicData, updatedAt: '2026-09-30' }).some((issue) => issue.path === 'updatedAt'));
});

test('slug, title, description, author, category, format, language, tags and translation key are validated', () => {
  for (const [field, value] of Object.entries({ slug: 'Bad Slug', title: ' ', description: '', author: '\n', category: 'crypto', format: 'BRIEF', lang: 'fr', tags: [5], translationKey: ' ' })) {
    assert.ok(validateArticleData({ ...publicData, [field]: value }).some((issue) => issue.path.startsWith(field)), field);
  }
  const { author, ...withoutAuthor } = publicData;
  assert.ok(validateArticleData(withoutAuthor).some((issue) => issue.path === 'author'));
});

test('sources are optional, but supplied sources require safe HTTP URLs and labels', () => {
  assert.deepEqual(validateArticleData({ ...publicData, sources: [{ url: 'https://example.com/classic', source: 'Classic text' }] }), []);
  for (const source of [{ url: 'javascript:alert(1)', source: 'x' }, { url: 'https://example.com', source: '' }, { source: 'x' }]) {
    assert.ok(validateArticleData({ ...publicData, sources: [source] }).some((issue) => issue.path.startsWith('sources')));
  }
});

test('Markdown fixture directory validates and malformed metadata reports violations', async () => {
  const results = await validateArticlePath(fixture('valid').pathname);
  assert.equal(results.length, 4);
  assert.ok(results.every((result) => result.valid));
  const invalid = await validateArticleFile(fixture('invalid.md').pathname);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.violations.some((issue) => issue.path === 'publishedAt'));
});

test('local metadata CLI returns success and failure exit statuses', () => {
  const script = new URL('../scripts/validate-article.ts', import.meta.url).pathname;
  for (const [path, expected] of [['valid', 0], ['invalid.md', 1]]) {
    const result = spawnSync(process.execPath, [script, fixture(path).pathname], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr || result.stdout);
  }
});


test('manual stories in new categories retain BRIEF/DEEP/DATA and all source/citation gates', () => {
  for (const vertical of ['wisdom', 'society']) {
    for (const storyChanges of [
      { type: 'ESSAY' },
      { cluster: [] },
      { sources: [editionData.stories[0].sources[0]] },
      { body: [{ text: 'Unresolved claim', citations: [99] }] },
    ]) {
      const data = structuredClone(editionData);
      data.vertical = vertical;
      Object.assign(data.stories[0], { publication: 'manual' }, storyChanges);
      assert.ok(validateEditionData(data).length > 0);
    }
  }
});
