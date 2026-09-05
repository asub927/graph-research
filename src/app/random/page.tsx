import Link from 'next/link';
import type { Metadata } from 'next';
import { RandomRedirect } from '@/components/RandomRedirect';
import { getAllPublishedItems } from '@/lib/queries';
import { pageMetadata } from '@/lib/seo';

/**
 * Jump to an arbitrary item.
 *
 * The pick happens in the browser rather than on the server, because a server
 * redirect would either have to be dynamic — a request to the database for
 * every visit to a novelty link — or be cached, at which point it stops being
 * random. Doing it client-side keeps the page static and the choice fresh.
 *
 * Excluded from the index and from the sitemap: there is nothing here to find,
 * and a crawler following it would attribute the content of whichever item it
 * landed on to this URL.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Random',
  description: 'Jump to an arbitrary item.',
  path: '/random',
  noIndex: true,
});

export default async function RandomPage() {
  const items = await getAllPublishedItems();
  const shortIds = items.map((item) => item.shortId);

  return (
    <>
      <RandomRedirect shortIds={shortIds} />

      <h1 className="page-title">Random</h1>

      {items.length === 0 ? (
        <p className="empty-state">Nothing published yet, so nothing to pick.</p>
      ) : (
        <>
          <p className="page-intro">
            Sending you somewhere arbitrary. If nothing happens, JavaScript is
            off &mdash; pick one yourself.
          </p>
          {/* The fallback is the same list the redirect draws from, so the
              page is never a dead end. */}
          <ul className="ranked-list">
            {items.map((item) => (
              <li key={item.shortId}>
                <span className="ranked-count">{item.edgeCount}</span>
                <span className="ranked-body">
                  <Link className="ranked-title" href={`/i/${item.shortId}`}>
                    {item.title ?? `Untitled ${item.type}`}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
