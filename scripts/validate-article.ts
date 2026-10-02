// Standalone article metadata has one schema for Astro and the local CLI.
import * as z from 'astro/zod';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATEGORY_KEYS } from '../src/lib/categories.ts';
import { summarize, type ValidationResult, type Violation } from './validate.ts';

export const ARTICLE_FORMATS = ['essay', 'feature', 'analysis'] as const;
export type ArticleFormat = (typeof ARTICLE_FORMATS)[number];

const text = z.string().trim().min(1);
// YAML parses unquoted dates as Date. Keep the public view consistently ISO text.
const timestamp = z.preprocess(
  (value) => value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : value,
  z.union([z.iso.date(), z.iso.datetime({ offset: true })])
    .transform((value) => new Date(value).toISOString()),
);
const source = z.object({
  url: z.url({ protocol: /^https?$/ }),
  source: text,
  title: text.optional(),
  publishedAt: timestamp.optional(),
});

export const articleMetadataSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: text,
  description: text,
  category: z.enum(CATEGORY_KEYS),
  format: z.enum(ARTICLE_FORMATS),
  author: text,
  lang: z.enum(['ko', 'en']),
  publishedAt: timestamp,
  updatedAt: timestamp.optional(),
  translationKey: text.optional(),
  tags: z.array(text).default([]),
  draft: z.boolean().default(true),
  sources: z.array(source).default([]),
}).superRefine((data, context) => {
  if (data.updatedAt && Date.parse(data.updatedAt) < Date.parse(data.publishedAt)) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt must not precede publishedAt' });
  }
});

export type ArticleMetadata = z.infer<typeof articleMetadataSchema>;

export function validateArticleData(data: unknown): Violation[] {
  const result = articleMetadataSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '$',
    message: issue.message,
  }));
}

export async function parseArticleMarkdown(raw: string): Promise<{ data: ArticleMetadata; body: string }> {
  const { parseFrontmatter } = await import('astro/markdown');
  const { frontmatter, content } = parseFrontmatter(raw);
  return { data: articleMetadataSchema.parse(frontmatter), body: content };
}

export async function validateArticleFile(file: string): Promise<ValidationResult> {
  // Read failures propagate to the CLI rather than pretending missing files are metadata errors.
  const raw = await readFile(file, 'utf8');
  let violations: Violation[];
  try {
    const { parseFrontmatter } = await import('astro/markdown');
    violations = validateArticleData(parseFrontmatter(raw).frontmatter);
  } catch (error: unknown) {
    violations = [{ path: '$', message: `invalid frontmatter: ${error instanceof Error ? error.message : String(error)}` }];
  }
  return { file, valid: violations.length === 0, violations };
}

export async function validateArticlePath(target: string): Promise<ValidationResult[]> {
  if ((await stat(target)).isFile()) return [await validateArticleFile(target)];
  const results: ValidationResult[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(await validateArticleFile(join(dir, entry.name)));
      }
    }
  }
  await walk(target);
  return results;
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? join(process.cwd(), 'src/content/articles');
  const { total, failed, lines } = summarize(await validateArticlePath(target));
  for (const line of lines) console.log(line);
  console.log(`\n${total} article file(s) checked, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error('article validation failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
