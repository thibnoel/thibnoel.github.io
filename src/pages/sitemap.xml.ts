import type { APIContext } from 'astro';
import { getPosts, getProjects, getPublications } from '../lib/content';

export async function GET(context: APIContext) {
  const [projects, publications, posts] = await Promise.all([getProjects(), getPublications(), getPosts()]);
  const paths = [
    '/',
    '/about/',
    '/tools/',
    '/projects/',
    ...projects.map((p) => `/projects/${p.id}/`),
    '/publications/',
    ...publications.map((p) => `/publications/${p.id}/`),
    ...(posts.length > 0 ? ['/posts/', ...posts.map((p) => `/posts/${p.id}/`)] : []),
  ];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, context.site)}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
