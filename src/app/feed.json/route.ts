import { absoluteUrl, site } from '@/lib/config';
import { excerpt, markdownToText, renderMarkdown } from '@/lib/markdown';
import { getAllPublishedItems } from '@/lib/queries';

/**
 * JSON Feed 1.1 — the agent-facing feed (R9).
 *
 * Each item carries a `_fyi` extension so a consumer gets the item's type and
 * connection count without a second request. The reference site's extension
 * carries `type` and `tags`; `connections` and `permalink` are added here
 * because they are the two things an agent otherwise has to go back for.
 */

export const dynamic = 'force-static';

const FEED_LIMIT = 100;

export async function GET(): Promise<Response> {
  const items = await getAllPublishedItems(FEED_LIMIT);

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: site.title,
    home_page_url: `${site.url}/`,
    feed_url: absoluteUrl('/feed.json'),
    description: site.tagline,
    language: 'en',
    authors: [{ name: site.author }],
    // Documented so a consumer can discover what `_fyi` means without reading
    // the site's prose.
    _fyi: {
      about: absoluteUrl('/llms.txt'),
      api: absoluteUrl('/openapi.json'),
      disclaimer: site.disclaimer,
    },
    items: items.map((item) => ({
      id: absoluteUrl(`/i/${item.shortId}`),
      url: absoluteUrl(`/i/${item.shortId}`),
      ...(item.url ? { external_url: item.url } : {}),
      ...(item.title ? { title: item.title } : {}),
      content_html: renderMarkdown(item.content),
      content_text: markdownToText(item.content),
      summary: excerpt(item.content, 300),
      date_published: item.publishedAt.toISOString(),
      ...(item.updatedAt ? { date_modified: item.updatedAt.toISOString() } : {}),
      ...(item.tags.length > 0 ? { tags: item.tags } : {}),
      _fyi: {
        type: item.type,
        tags: item.tags,
        short_id: item.shortId,
        connections: item.edgeCount,
        permalink: absoluteUrl(`/i/${item.shortId}`),
      },
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'content-type': 'application/feed+json; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
