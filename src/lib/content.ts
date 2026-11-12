import { getCollection, type CollectionEntry } from 'astro:content';

export async function getProjects() {
  const entries = await getCollection('projects', ({ data }) => import.meta.env.DEV || !data.draft);
  return entries.sort((a, b) => a.data.order - b.data.order);
}

export async function getProjectsForPublication(publication: CollectionEntry<'publications'>) {
  const projects = await getProjects();
  return projects.filter((p) => p.data.publications.some((ref) => ref.id === publication.id));
}

export async function getPublications() {
  const entries = await getCollection('publications');
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getPosts() {
  const entries = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
