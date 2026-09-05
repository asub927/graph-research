import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { absoluteUrl, site } from '@/lib/config';
import { API_BASE, API_ENDPOINTS, API_ERRORS } from '@/lib/openapi';
import { RATE_LIMIT } from '@/lib/rate-limit';
import { EDGE_META, EDGE_TYPES, ITEM_TYPES } from '@/lib/types';

/**
 * The API in prose, generated from the same catalogue as `/openapi.json` so the
 * two cannot disagree.
 *
 * The rate-limit section states the limit the code actually enforces, and its
 * caveat. The reference site's docs claim no rate limits while its responses
 * advertise a policy header; documenting a number the server does not enforce
 * is the same defect in the other direction, so the honest version says both
 * the number and why it is soft.
 */

export const metadata: Metadata = pageMetadata({
  title: 'API & docs',
  description: `The public, read-only query API for ${site.title}: endpoints, edge vocabulary, errors, and limits.`,
  path: '/docs',
});

function curlFor(examplePath: string): string {
  return `curl -s '${absoluteUrl(`${API_BASE}${examplePath}`)}'`;
}

export default function DocsPage() {
  return (
    <>
      <h1 className="page-title">API &amp; docs</h1>
      <p className="page-intro">
        Six read-only endpoints over the item stream and its typed edge graph.
        Public, unauthenticated, and stable. The machine-readable version of
        this page is <a href="/openapi.json">/openapi.json</a>, generated from
        the same definitions.
      </p>

      <section className="prose" aria-labelledby="conventions">
        <h2 id="conventions">Conventions</h2>
        <ul>
          <li>
            Base path <code>{API_BASE}</code>. Everything returns{' '}
            <code>application/json</code>; errors return{' '}
            <code>application/problem+json</code> (RFC 9457).
          </li>
          <li>
            Identifiers appear as path segments, not query parameters. Some
            agent fetch tools strip query strings that look like ids, which
            turns a lookup into a silent list.
          </li>
          <li>
            An item is addressable by its eight-character short id or its full
            UUID. Short ids are what appear in permalinks and never change.
          </li>
          <li>
            Times are ISO 8601 in UTC. Dates in filters are plain calendar dates.
          </li>
        </ul>
      </section>

      <section className="prose" aria-labelledby="endpoints">
        <h2 id="endpoints">Endpoints</h2>
        {API_ENDPOINTS.map((endpoint) => (
          <section key={endpoint.operationId} aria-labelledby={endpoint.operationId}>
            <h3 id={endpoint.operationId}>
              <code>
                GET {API_BASE}
                {endpoint.path}
              </code>
            </h3>
            <p>{endpoint.description}</p>

            {endpoint.parameters.length > 0 ? (
              <dl>
                {endpoint.parameters.map((parameter) => (
                  <div key={parameter.name}>
                    <dt>
                      <code>{parameter.name}</code>{' '}
                      <span className="param-note">
                        {parameter.in}
                        {parameter.required ? ', required' : ', optional'}
                      </span>
                    </dt>
                    <dd>{parameter.description}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="param-note">No parameters.</p>
            )}

            <pre>
              <code>{curlFor(endpoint.examplePath)}</code>
            </pre>
          </section>
        ))}
      </section>

      <section className="prose" aria-labelledby="vocabulary">
        <h2 id="vocabulary">Vocabulary</h2>
        <h3 id="item-types">Item types</h3>
        <p>
          <code>{ITEM_TYPES.join('</code>, <code>')}</code>. A{' '}
          <strong>link</strong> is something read elsewhere, summarised and
          commented on. A <strong>riff</strong> is written here and has no source
          URL. An <strong>essay</strong> points at longer writing published
          elsewhere.
        </p>
        <h3 id="edge-types">Edge types</h3>
        <p>
          Edges are stored once and are directional. The same edge reads in the
          opposite voice from the other endpoint, which is what the{' '}
          <code>label</code> field on <code>/edges/{'{itemId}'}</code> gives you.
        </p>
        <dl>
          {EDGE_TYPES.map((type) => (
            <div key={type}>
              <dt>
                <code>{type}</code>
              </dt>
              <dd>
                {EDGE_META[type].description} Rendered as &ldquo;
                {EDGE_META[type].outgoingLabel}&rdquo; from the source and
                &ldquo;{EDGE_META[type].incomingLabel}&rdquo; from the target.
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Every edge carries a <code>confidence</code> between 0 and 1 and a{' '}
          <code>reason</code> in plain language. The reason is the same sentence
          shown to readers on the item page &mdash; there is no separate internal
          rationale.
        </p>
      </section>

      <section className="prose" aria-labelledby="limits">
        <h2 id="limits">Rate limits</h2>
        <p>
          {RATE_LIMIT.limit} requests per {RATE_LIMIT.windowSeconds} seconds,
          counted per server instance. Because the counter lives in the process
          rather than in shared storage, a deployment running several warm
          instances will in practice allow more than that. Treat the number as a
          courtesy ceiling rather than a quota.
        </p>
        <p>
          Every response carries <code>ratelimit-limit</code>,{' '}
          <code>ratelimit-remaining</code>, and <code>ratelimit-reset</code>.
          Pacing against those is more reliable than pacing against the number
          above. A refusal returns 429 with <code>retry-after</code> in seconds.
        </p>
        <p>
          If you want the whole corpus, do not page through{' '}
          <code>/items</code> &mdash; fetch <a href="/feed.json">/feed.json</a>{' '}
          once.
        </p>
      </section>

      <section className="prose" aria-labelledby="errors">
        <h2 id="errors">Errors</h2>
        <p>
          Errors are RFC 9457 problem documents. The <code>type</code> member is
          a URL that resolves to the matching heading below, so following it
          lands on the explanation rather than on a generic page.
        </p>
        <dl>
          {API_ERRORS.map((error) => (
            <div key={error.slug} id={`error-${error.slug}`}>
              <dt>
                <code>{error.slug}</code> &mdash; {error.status} {error.title}
              </dt>
              <dd>{error.detail}</dd>
            </div>
          ))}
        </dl>
        <p id="error-general">
          Anything not listed above reports as <code>general</code>. If you see
          one, the <code>detail</code> member is the whole story.
        </p>
      </section>

      <section className="prose" aria-labelledby="beyond">
        <h2 id="beyond">Beyond the API</h2>
        <ul>
          <li>
            <a href="/feed.json">/feed.json</a> &mdash; the whole corpus in one
            request, JSON Feed 1.1 with a <code>_fyi</code> extension.
          </li>
          <li>
            <a href="/llms.txt">/llms.txt</a> &mdash; when this corpus is worth
            consulting, and when it is not.
          </li>
          <li>
            <Link href="/agents">/agents</Link> &mdash; a copyable context block
            for a system prompt.
          </li>
          <li>
            <a href="/index.md">/index.md</a> &mdash; the site as Markdown. Any
            page will serve Markdown for <code>Accept: text/markdown</code>.
          </li>
        </ul>
      </section>
    </>
  );
}
