import { defineCollection, reference } from 'astro:content';
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
    // Publication date: issue date (journals), first conference day (conferences), defense date (theses).
    date: z.coerce.date(),
    venue: z.string(),
    citation: z.string(),
    bibtex: z.string(),
    doi: z.string().optional(),
    video: z
      .object({ title: z.string(), youtube: z.string().optional(), src: z.url().optional() })
      .refine((v) => !!v.youtube !== !!v.src, 'pass exactly one of `youtube` or `src`')
      .optional(),
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

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects', generateId: byFileName }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // One line, shown on cards and as the page description.
      summary: z.string(),
      period: z.string(),
      organisation: z.string(),
      role: z.string(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      // Card image on project lists; falls back to `cover`.
      preview: image().optional(),
      previewAlt: z.string().optional(),
      skills: z.array(z.string()).default([]),
      publications: z.array(reference('publications')).default([]),
      featured: z.boolean().default(false),
      // Ascending sort key for project lists.
      order: z.number(),
      // Drafts render in `astro dev` but are excluded from production builds.
      draft: z.boolean().default(false),
    }),
});

export const collections = { publications, posts, projects };
