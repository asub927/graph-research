import Link from 'next/link';
import { REPRESENTATIONS } from '@/lib/representations';

/**
 * The 404, written for whoever arrived — which is usually not a person.
 *
 * The reference site serves its 404 as `text/markdown` to every client,
 * including browsers, which means a mistyped URL renders as raw source. Here
 * the negotiation decides: a browser gets this page, and anything asking for
 * Markdown gets the same list at `/404.md`. Both name the machine-readable
 * entry points, because a dead URL is the most likely moment for an agent to
 * need them.
 */

export default function NotFound() {
  return (
    <>
      <h1 className="page-title">Not found</h1>
      <p className="page-intro">
        There is nothing at this address. Item permalinks never change once
        published, so this was either never a URL here or was only ever a draft.
      </p>

      <section className="prose" aria-labelledby="entry-points">
        <h2 id="entry-points">Where to go instead</h2>
        <ul>
          <li>
            <Link href="/">The stream</Link> — everything, newest first.
          </li>
          <li>
            <Link href="/search">Search</Link> — if you know roughly what you
            were looking for.
          </li>
          <li>
            <Link href="/themes">Themes</Link> — the clusters that have
            accumulated enough connections to stand on their own.
          </li>
        </ul>

        <h2 id="machine-readable">Machine-readable entry points</h2>
        <dl>
          {REPRESENTATIONS.map((entry) => (
            <div key={entry.mediaType}>
              <dt>
                <a href={entry.path}>
                  <code>{entry.path}</code>
                </a>{' '}
                <span className="param-note">{entry.mediaType}</span>
              </dt>
              <dd>{entry.note}</dd>
            </div>
          ))}
          <div>
            <dt>
              <a href="/404.md">
                <code>/404.md</code>
              </a>{' '}
              <span className="param-note">text/markdown</span>
            </dt>
            <dd>This page, as Markdown.</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
