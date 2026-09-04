import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Connections } from '@/components/Connections';
import { ItemMeta } from '@/components/StreamItem';
import { absoluteUrl } from '@/lib/config';
import { formatDayWithTime, formatIsoDateTime } from '@/lib/dates';
import { excerpt, renderMarkdown } from '@/lib/markdown';
import { getAllPublishedItems, getConnections, getItem } from '@/lib/queries';
import { itemGraph, jsonLdScript, pageMetadata } from '@/lib/seo';
import { isShortId } from '@/lib/shortid';

interface PageProps {
  params: Promise<{ shortId: string }>;
}

export async function generateStaticParams(): Promise<Array<{ shortId: string }>> {
  const items = await getAllPublishedItems();
  return items.map((item) => ({ shortId: item.shortId }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shortId } = await params;
  const item = isShortId(shortId) ? await getItem(shortId) : null;
  if (!item) return { title: 'Not found' };

  return pageMetadata({
    title: item.title ?? `Item ${item.shortId}`,
    // R17 aside: the description is flattened prose, so it never begins with a
    // stray "> " the way the reference site's does.
    description: excerpt(item.content, 200),
    path: `/i/${item.shortId}`,
    type: 'article',
    publishedTime: item.publishedAt,
    modifiedTime: item.updatedAt ?? undefined,
  });
}

export default async function ItemPage({ params }: PageProps) {
  const { shortId } = await params;
  if (!isShortId(shortId)) notFound();

  const item = await getItem(shortId);
  if (!item) notFound();

  const connections = await getConnections(item.id);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemGraph(item)) }}
      />

      <article>
        {/* R17: the item is the page subject, so it holds the only h1. */}
        <h1 className="item-title item-title-lead page-title">
          {item.title ?? `Item ${item.shortId}`}
        </h1>

        <div
          className="item-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }}
        />

        <ItemMeta item={item} showPermalink={false} />

        <Connections connections={connections} />

        <section className="item-permalink-meta" aria-label="Item metadata">
          <table>
            <tbody>
              <tr>
                <th scope="row">Type</th>
                <td>{item.type}</td>
              </tr>
              <tr>
                <th scope="row">First published</th>
                <td>
                  <time dateTime={formatIsoDateTime(item.publishedAt)}>
                    {formatDayWithTime(item.publishedAt)}
                  </time>
                </td>
              </tr>
              {item.updatedAt ? (
                <tr>
                  <th scope="row">Updated</th>
                  <td>
                    <time dateTime={formatIsoDateTime(item.updatedAt)}>
                      {formatDayWithTime(item.updatedAt)}
                    </time>
                  </td>
                </tr>
              ) : null}
              {item.url ? (
                <tr>
                  <th scope="row">Location</th>
                  <td>
                    <a href={item.url} rel="noopener nofollow ugc">
                      {item.url}
                    </a>
                  </td>
                </tr>
              ) : null}
              <tr>
                <th scope="row">URL</th>
                <td>{absoluteUrl(`/i/${item.shortId}`)}</td>
              </tr>
              <tr>
                <th scope="row">Connections</th>
                <td>{item.edgeCount}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </article>
    </>
  );
}
