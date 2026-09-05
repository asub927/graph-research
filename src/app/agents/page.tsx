import Link from 'next/link';
import type { Metadata } from 'next';
import { CopyButton } from '@/components/CopyButton';
import { buildAgentContext, loadAgentSnapshot } from '@/lib/agent-views';
import { pageMetadata } from '@/lib/seo';
import { absoluteUrl, site } from '@/lib/config';
import { API_BASE } from '@/lib/openapi';
import { formatIsoDateTime } from '@/lib/dates';
import { REPRESENTATIONS } from '@/lib/representations';

/**
 * The page an agent's operator lands on: a ready-made context block, plus the
 * short version of how to read this site without one.
 *
 * The block is regenerated on every publish and carries its own timestamp and
 * invalidation advice (R11), because the whole point of a copyable block is
 * that it gets copied somewhere this site cannot reach.
 */

export const metadata: Metadata = pageMetadata({
  title: 'For your agent',
  description:
    'A copyable context block, the machine-readable entry points, and how to ' +
    `query ${site.title} from an agent.`,
  path: '/agents',
});

export default async function AgentsPage() {
  const snapshot = await loadAgentSnapshot();
  const context = buildAgentContext(snapshot);

  return (
    <>
      <h1 className="page-title">For your agent</h1>
      <p className="page-intro">
        Everything here is public, unauthenticated, and stable. Nothing on this
        page needs a key, and no endpoint is rate-limited beyond a courtesy
        ceiling described in <Link href="/docs">the API reference</Link>.
      </p>

      <section className="prose" aria-labelledby="context">
        <h2 id="context">Context block</h2>
        <p>
          Paste this into a system prompt to give an agent a working picture of
          the corpus. It was generated{' '}
          <time dateTime={formatIsoDateTime(snapshot.generatedAt)}>
            {snapshot.generatedAt.toISOString()}
          </time>{' '}
          and is rewritten whenever something is published, so it will drift
          once copied — which is why it says so in its own text.
        </p>

        <CopyButton text={context} label="Copy context block" />

        <details>
          <summary>Preview the block ({context.length.toLocaleString()} characters)</summary>
          {/* Also the fallback: with JavaScript off the copy button does
              nothing, and this is the text to select by hand. */}
          <pre className="context-block">{context}</pre>
        </details>
      </section>

      <section className="prose" aria-labelledby="fetch-first">
        <h2 id="fetch-first">If you would rather fetch than paste</h2>
        <p>
          Three requests cover most of what an agent needs, in decreasing order
          of how much they return:
        </p>
        <ol>
          <li>
            <a href="/llms.txt">
              <code>/llms.txt</code>
            </a>{' '}
            — what this corpus is, when it is worth reading, and when it is not.
            Start here.
          </li>
          <li>
            <a href="/feed.json">
              <code>/feed.json</code>
            </a>{' '}
            — every item with full content, plus a <code>_fyi</code> extension
            carrying type, tags, short id, and connection count.
          </li>
          <li>
            <a href={`${API_BASE}/summary`}>
              <code>{API_BASE}/summary</code>
            </a>{' '}
            — the shape of the graph rather than its contents: size, edge-type
            histogram, hubs, recent items, and current disagreements.
          </li>
        </ol>
      </section>

      <section className="prose" aria-labelledby="representations">
        <h2 id="representations">Representations</h2>
        <p>
          Every page also answers to <code>Accept: text/markdown</code>. An{' '}
          <code>Accept</code> header naming only types this site does not serve
          gets a 406 listing these instead of an HTML page it said it could not
          read.
        </p>
        <dl>
          {REPRESENTATIONS.map((entry) => (
            <div key={entry.mediaType}>
              <dt>
                <code>{entry.mediaType}</code> &mdash;{' '}
                <a href={entry.path}>{entry.path}</a>
              </dt>
              <dd>{entry.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="prose" aria-labelledby="citing">
        <h2 id="citing">Citing this</h2>
        <p>
          Quote freely, and link to the item permalink rather than to this
          site&rsquo;s front page &mdash; permalinks are{' '}
          <code>{absoluteUrl('/i/{shortId}')}</code> and do not change. Attribute
          to {site.author}. Bear in mind that {site.disclaimer.toLowerCase()}: an
          item appearing here is not an endorsement of its claims, and the
          commentary attached to it is the part that states a position.
        </p>
      </section>
    </>
  );
}
