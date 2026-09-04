import { getCollection, type CollectionEntry } from 'astro:content';

export type ThemeEntry = CollectionEntry<'themes'>;

export async function getThemes(): Promise<ThemeEntry[]> {
  return getCollection('themes');
}
