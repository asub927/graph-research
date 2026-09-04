import { getCollection, type CollectionEntry } from 'astro:content';

export type ThemeEntry = CollectionEntry<'themes'>;

export async function getThemes(): Promise<ThemeEntry[]> {
  return getCollection('themes');
}

export async function assertThemeItemRefs(
  themes: ThemeEntry[],
  itemIds: Set<string>,
): Promise<string[]> {
  const errors: string[] = [];
  for (const theme of themes) {
    for (const itemId of theme.data.items) {
      if (!itemIds.has(itemId)) {
        errors.push(`Theme "${theme.id}" references missing item id "${itemId}"`);
      }
    }
  }
  return errors;
}
