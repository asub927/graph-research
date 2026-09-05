import type { Metadata } from 'next';
import Link from 'next/link';
import { formatIsoDate } from '@/lib/dates';
import { excerpt } from '@/lib/markdown';
import { countEdges, getMostConnected } from '@/lib/queries';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Most connected',
  description:
    'Items ranked by how many other items they connect to. The densest nodes ' +
    'are the ideas this site keeps returning to.',
  path: '/connected',
});

export default async function ConnectedPage() {
  const [items, totalEdges] = await Promise.all([getMostConnected(60), countEdges()]);

  return (
    <div>
      <h1 className="page-title">Most connected</h1>
      <p className="page-intro">
        Ranked by incident connections in either direction. {totalEdges} connection
        {totalEdges === 1 ? '' : 's'} across the corpus. A dense node is not
        necessarily an important idea &mdash; it is one this site has circled
        repeatedly.
      </p>

      {items.length === 0 ? (
        <p className="empty-state">
          Nothing is connected yet. Connections are proposed when items are
          published, so this fills in as the corpus grows.
        </p>
      ) : (
        <ol className="ranked-list">
          {items.map((item) => (
            <li key={item.id}>
              {/* R7: the same badge shape used in the stream and on /themes. */}
              <span className="ranked-count">
                <span className="edge-badge">{item.edgeCount}</span>
              </span>
              <span className="ranked-body">
                <Link className="ranked-title" href={`/i/${item.shortId}`}>
                  {item.title ?? `Item ${item.shortId}`}
                </Link>
                <span className="ranked-detail">
                  {item.type} &middot;{' '}
                  <time dateTime={formatIsoDate(item.publishedAt)}>
                    {formatIsoDate(item.publishedAt)}
                  </time>{' '}
                  &middot; {excerpt(item.content, 110)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
