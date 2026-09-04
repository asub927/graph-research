import type { APIRoute } from 'astro';
import { getPublicItems, itemPermalink } from '../lib/items';

export const GET: APIRoute = async ({ site }) => {
  const items = await getPublicItems();
  const home = site?.href ?? 'https://example.com/';
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Attention Journal',
    home_page_url: home,
    feed_url: new URL('/feed.json', home).href,
    description: 'Annotated attention receipts for humans and agents.',
    items: items.map((item) => ({
      id: itemPermalink(item.id),
      url: new URL(itemPermalink(item.id), home).href,
      title: item.data.title,
      content_text: item.data.stance,
      date_published: item.data.date.toISOString(),
      tags: item.data.tags,
      external_url: item.data.url,
      _musings: {
        type: item.data.type,
        stance: item.data.stance,
        status: item.data.status,
        context: item.data.context,
      },
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
};
