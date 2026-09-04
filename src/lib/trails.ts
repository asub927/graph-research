import { getCollection, type CollectionEntry } from 'astro:content';

export type TrailEntry = CollectionEntry<'trails'>;

export async function getTrailsForItem(itemId: string): Promise<TrailEntry[]> {
  const trails = await getCollection('trails');
  return trails
    .filter((t) => t.data.from === itemId || t.data.to === itemId)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function otherItemId(trail: TrailEntry, itemId: string): string {
  return trail.data.from === itemId ? trail.data.to : trail.data.from;
}
