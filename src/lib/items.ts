import { getCollection, type CollectionEntry } from 'astro:content';

export type ItemEntry = CollectionEntry<'items'>;

export async function getPublicItems(): Promise<ItemEntry[]> {
  const all = await getCollection('items');
  return all
    .filter((item) => item.data.status === 'public')
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function itemPermalink(id: string): string {
  return `/i/${id}/`;
}
