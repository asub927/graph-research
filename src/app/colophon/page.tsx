import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { embeddingConfig, graphConfig, site } from '@/lib/config';

export const metadata: Metadata = pageMetadata({
  title: 'Colophon',
  description: `How ${site.title} is built, and the principles it is built on.`,
  path: '/colophon',
});

export default function ColophonPage() {
  return (
    <>
      <h1 className="page-title">Colophon</h1>
      <p className="page-intro">
        What this is made of, and the handful of decisions that shaped
        everything else.
      </p>

      <section className="prose" aria-labelledby="stack">
        <h2 id="stack">Stack</h2>
        <dl>
          <div>
            <dt>Framework</dt>
            <dd>
              Next.js with the App Router. Pages are statically rendered and
              revalidated on publish, so a reader gets a cached document and the
              database is only touched by the API and the pipeline.
            </dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>
              Postgres with <code>pgvector</code>. Three tables: items, edges,
              themes. Local development runs the same SQL against PGlite, an
              in-process WASM build of Postgres, so nothing has to be installed
              to work on this.
            </dd>
          </div>
          <div>
            <dt>Language model</dt>
            <dd>
              Writes the summary on each item and proposes the connections
              between items, with a confidence and a reason for each. Embeddings
              are {embeddingConfig.dimensions}-dimensional (
              <code>{embeddingConfig.model}</code>) and back both the candidate
              search and the search page.
            </dd>
          </div>
          <div>
            <dt>Visualisation</dt>
            <dd>
              D3 &mdash; force layout, drag, and zoom &mdash; on{' '}
              <Link href="/graph">the graph page</Link>, and nowhere else.
            </dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>
              Whatever your system uses. No webfont is loaded, which is one
              fewer request, one fewer third party, and one fewer thing to
              render-block.
            </dd>
          </div>
        </dl>
      </section>

      <section className="prose" aria-labelledby="principles">
        <h2 id="principles">Principles</h2>
        <dl>
          <div>
            <dt>Two audiences, one corpus</dt>
            <dd>
              Every page is also available as Markdown, JSON, or a feed, from
              the same data. The agent-facing surface is not a export of the
              human one; they are two renderings of the same thing, which is why
              neither can go stale relative to the other.
            </dd>
          </div>
          <div>
            <dt>No JavaScript unless it earns it</dt>
            <dd>
              Four exceptions: the graph, the search page, the random redirect,
              and the copy button on <Link href="/agents">/agents</Link>. Every
              other page is HTML and CSS, and the three that are not have a
              stated fallback.
            </dd>
          </div>
          <div>
            <dt>Structure is derived, not declared</dt>
            <dd>
              There is no tag taxonomy and no editorial hierarchy. Themes emerge
              from connection density and are demoted when denser clusters
              overtake them, so the site&rsquo;s shape follows what has actually
              accumulated rather than what was planned.
            </dd>
          </div>
          <div>
            <dt>Say what the machine did</dt>
            <dd>
              The summary on each item is model-written and the connection
              reasons are model-written, and both are labelled as such. A
              connection below{' '}
              {Math.round(graphConfig.edgeConfidenceFloor * 100)}% confidence is
              not published at all, and no more than{' '}
              {graphConfig.edgeMaxPerItem} survive per item &mdash; without both
              limits the graph fills with plausible noise.
            </dd>
          </div>
          <div>
            <dt>Permalinks are permanent</dt>
            <dd>
              An item&rsquo;s eight-character id is derived from its UUID on
              first publish and is never reissued. Nothing here will 404 because
              it was reorganised.
            </dd>
          </div>
          <div>
            <dt>Document what is enforced</dt>
            <dd>
              The OpenAPI document is generated from the same definitions the
              handlers use, so the published edge vocabulary is the one the code
              emits. The rate limit stated in <Link href="/docs">/docs</Link> is
              the one the limiter applies, including the part about why it is
              soft.
            </dd>
          </div>
        </dl>
      </section>

      <section className="prose" aria-labelledby="colours">
        <h2 id="colours">Colour</h2>
        <p>
          Two palettes, chosen by <code>prefers-color-scheme</code>, with no
          toggle &mdash; a toggle needs a script and somewhere to remember your
          choice, and this site has neither. Each connection type has a colour,
          used consistently in the graph legend, the connection headings on item
          pages, and the theme sections, so the same relationship looks the same
          everywhere it appears.
        </p>
      </section>
    </>
  );
}
