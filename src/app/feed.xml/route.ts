import { absoluteUrl, site } from '@/lib/config';
import { formatAtomDate } from '@/lib/dates';
import { excerpt, renderMarkdown } from '@/lib/markdown';
import { getAllPublishedItems, getLatestPublishedAt } from '@/lib/queries';
import { escapeXml } from '@/lib/xml';

/**
 * Atom — the human-facing feed (R9).
 *
 * Carries full rendered HTML per entry so a feed reader shows the summary and
 * commentary in full, rather than a teaser that forces a click. Entry ids are
 * `urn:uuid:` forms of the item's UUID, which stay stable even if the site
 * moves domain.
 */

export const dynamic = 'force-static';

const FEED_LIMIT = 100;

export async function GET(): Promise<Response> {
  const [items, latest] = await Promise.all([
    getAllPublishedItems(FEED_LIMIT),
    getLatestPublishedAt(),
  ]);

  const updated = formatAtomDate(latest ?? new Date());

  const entries = items
    .map((item) => {
      const permalink = absoluteUrl(`/i/${item.shortId}`);
      const title = item.title ?? `Item ${item.shortId}`;

      return `  <entry>
    <title type="text">${escapeXml(title)}</title>
    <id>urn:uuid:${item.id}</id>
    <link rel="alternate" type="text/html" href="${escapeXml(permalink)}"/>
${item.url ? `    <link rel="related" href="${escapeXml(item.url)}"/>\n` : ''}\
    <published>${formatAtomDate(item.publishedAt)}</published>
    <updated>${formatAtomDate(item.updatedAt ?? item.publishedAt)}</updated>
    <category term="${escapeXml(item.type)}"/>
${item.tags.map((tag) => `    <category term="${escapeXml(tag)}"/>\n`).join('')}\
    <summary type="text">${escapeXml(excerpt(item.content, 300))}</summary>
    <content type="html">${escapeXml(renderMarkdown(item.content))}</content>
  </entry>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">${escapeXml(site.title)}</title>
  <subtitle type="text">${escapeXml(site.tagline)}</subtitle>
  <id>${escapeXml(`${site.url}/`)}</id>
  <link rel="alternate" type="text/html" href="${escapeXml(`${site.url}/`)}"/>
  <link rel="self" type="application/atom+xml" href="${escapeXml(absoluteUrl('/feed.xml'))}"/>
  <link rel="alternate" type="application/feed+json" href="${escapeXml(absoluteUrl('/feed.json'))}"/>
  <updated>${updated}</updated>
  <rights type="text">${escapeXml(site.disclaimer)}</rights>
  <author>
    <name>${escapeXml(site.author)}</name>
  </author>
  <generator uri="${escapeXml(site.url)}">fyi</generator>
${entries}
</feed>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/atom+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
