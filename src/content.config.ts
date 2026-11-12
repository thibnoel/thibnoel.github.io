import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { PUBLICATION_CATEGORIES } from './site';

const categories = Object.keys(PUBLICATION_CATEGORIES) as [keyof typeof PUBLICATION_CATEGORIES];

// Entry ids are the file names, so /publications/<file>/ URLs match the Jekyll site.
const byFileName = ({ entry }: { entry: string }) => entry.replace(/\.mdx?$/, '');

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/publications', generateId: byFileName }),
  schema: z.object({
    title: z.string(),
    category: z.enum(categories),
    excerpt: z.string(),
    date: z.coerce.date(),
    venue: z.string(),
    citation: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts', generateId: byFileName }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    // Drafts render in `astro dev` but are excluded from production builds.
    draft: z.boolean().default(false),
  }),
});

export const collections = { publications, posts };
