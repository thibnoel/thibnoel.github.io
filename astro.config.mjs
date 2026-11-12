// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://thnoel.com',
  // Keep the Jekyll-era URL shape (/about/, /publications/sdgrm/).
  trailingSlash: 'always',
  integrations: [mdx()],
  markdown: {
    // Unified (remark/rehype) instead of the default Sätteri processor, for remark-math + KaTeX.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
});
