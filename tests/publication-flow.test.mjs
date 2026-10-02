import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_KEYS } from '../src/lib/categories.ts';
import { VERTICALS } from '../scripts/lib/types.ts';
import { assertExistingStoriesPreserved } from '../scripts/synth.ts';

const existing = {
  date: '2026-10-02',
  vertical: 'ai',
  lang: 'en',
  stories: [
    { slug: 'scheduled-news', publication: 'scheduled' },
    { slug: 'manual-feature', publication: 'manual' },
  ],
};

test('site category expansion keeps automatic collection limited to its four news categories', () => {
  assert.deepEqual([...CATEGORY_KEYS], ['ai', 'bio', 'geo', 'markets', 'wisdom', 'society']);
  assert.deepEqual(VERTICALS, ['ai', 'bio', 'geo', 'markets']);
});

test('same-date input may add a feature while preserving existing news and manual articles', () => {
  assert.doesNotThrow(() => assertExistingStoriesPreserved(existing, {
    ...existing,
    stories: [...existing.stories, { slug: 'another-feature', publication: 'manual' }],
  }));
});

test('same-date replacement rejects omitted articles before writing', () => {
  assert.throws(() => assertExistingStoriesPreserved(existing, {
    ...existing,
    stories: [{ slug: 'fresh-news' }],
  }), /Merge existing story/);
});

test('same-date replacement protects the manual feature classification', () => {
  assert.throws(() => assertExistingStoriesPreserved(existing, {
    ...existing,
    stories: [{ slug: 'scheduled-news' }, { slug: 'manual-feature' }],
  }), /Preserve manual publication/);
});

test('same-date replacement rejects mismatched category or language', () => {
  for (const override of [{ vertical: 'society' }, { lang: 'ko' }]) {
    assert.throws(() => assertExistingStoriesPreserved(existing, { ...existing, ...override }), /identity mismatch/);
  }
});
