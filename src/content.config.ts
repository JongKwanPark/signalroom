import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const citation = z.object({
  id: z.number().int().positive(),
  url: z.string().url(),
  source: z.string().min(1),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
});

const clusterLink = z.object({
  url: z.string().url(),
  source: z.string().min(1),
  title: z.string().optional(),
});

const bodyBlock = z.object({
  text: z.string().min(1),
  citations: z.array(z.number().int().positive()).min(1),
});

const story = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  headline: z.string().min(1),
  dek: z.string().optional(),
  type: z.enum(['BRIEF', 'DEEP', 'DATA']),
  readMinutes: z.number().min(1).max(60),
  tldr: z.array(z.string().min(1)).length(3),
  body: z.array(bodyBlock).min(1),
  whyItMatters: z.string().min(1),
  editorNote: z.string().min(1),
  cluster: z.array(clusterLink).min(1),
  sources: z.array(citation).min(1),
  tags: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

const editions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/editions' }),
  schema: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generatedAt: z.string(),
    vertical: z.enum(['ai', 'bio', 'geo', 'markets']),
    title: z.string().min(1),
    summary: z.string().min(1),
    stories: z.array(story).min(1).max(8),
  }),
});

export const collections = { editions };
