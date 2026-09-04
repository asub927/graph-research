import { getCollection, type CollectionEntry } from 'astro:content';

export type ItemEntry = CollectionEntry<'items'>;

export async function getPublicItems(): Promise<ItemEntry[]> {
  const all = await getCollection('items');
  return all
    .filter((item) => item.data.status === 'public')
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getPublicItemById(id: string): Promise<ItemEntry | undefined> {
  const items = await getPublicItems();
  return items.find((item) => item.id === id);
}

export function itemPermalink(id: string): string {
  return `/i/${id}/`;
}
