import type { APIRoute } from 'astro';
import { getPublicItems, itemPermalink } from '../lib/items';

export const GET: APIRoute = async ({ site }) => {
  const items = await getPublicItems();
  const home = site?.href ?? 'https://example.com/';
  const index = items.map((item) => ({
    id: item.id,
    title: item.data.title,
    type: item.data.type,
    stance: item.data.stance,
    permalink: new URL(itemPermalink(item.id), home).href,
    date: item.data.date.toISOString(),
    tags: item.data.tags,
    url: item.data.url ?? null,
  }));

  return new Response(JSON.stringify({ version: 1, items: index }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
