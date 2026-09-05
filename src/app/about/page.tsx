import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/config';
import { graphConfig } from '@/lib/config';
import { EDGE_META, EDGE_TYPES } from '@/lib/types';

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description: `What ${site.title} is, how items get here, and how the connections between them are made.`,
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <h1 className="page-title">About</h1>
      <p className="page-intro">
        {site.title} is a running record of what I read and what I made of it.
        Every entry carries commentary, and every entry is connected to the
        others by a stated relationship rather than by a tag.
      </p>

      <section className="prose" aria-labelledby="what-is-here">
        <h2 id="what-is-here">What is here</h2>
        <p>
          Three kinds of thing. A <strong>link</strong> is something I read
          elsewhere, summarised and then commented on &mdash; the summary tells
          you what it says, the commentary tells you what I think about it. A{' '}
          <strong>riff</strong> is written here and points nowhere: a thought
          that did not need a source. An <strong>essay</strong> points at longer
          writing published elsewhere.
        </p>
        <p>
          {site.disclaimer} That is not a hedge. A link appears here because it
          was worth the time, which is a lower bar than being right, and often a
          more interesting one.
        </p>
      </section>

      <section className="prose" aria-labelledby="connections">
        <h2 id="connections">How the connections work</h2>
        <p>
          When something is published, it is embedded and compared against
          everything already here. The nearest{' '}
          {graphConfig.edgeCandidateCount} candidates go to a language model,
          which decides for each pair whether there is a real relationship, what
          kind, and why. Anything it is less than{' '}
          {Math.round(graphConfig.edgeConfidenceFloor * 100)}% sure of is
          discarded, and at most {graphConfig.edgeMaxPerItem} connections survive
          per item. Without those two limits the graph fills with vague
          relatedness and stops meaning anything.
        </p>
        <p>The vocabulary is fixed, and small on purpose:</p>
        <dl>
          {EDGE_TYPES.map((type) => (
            <div key={type}>
              <dt>{EDGE_META[type].outgoingLabel}</dt>
              <dd>{EDGE_META[type].description}</dd>
            </div>
          ))}
        </dl>
        <p>
          Connections are directional, so the same edge reads differently from
          each end: what one item &ldquo;supports&rdquo; is, from the other
          side, &ldquo;supported by&rdquo; it. The sentence explaining each
          connection is written by the model and published unedited &mdash;
          there is no private version. If a reason reads oddly, that is the
          actual state of the graph, not a rendering of something better.
        </p>
      </section>

      <section className="prose" aria-labelledby="themes">
        <h2 id="themes">Why there are no categories</h2>
        <p>
          <Link href="/themes">Themes</Link> are not a taxonomy I maintain. An
          item that accumulates {graphConfig.themeHubThreshold} or more
          connections becomes a hub, and the hub plus everything attached to it
          is a theme. Which means themes appear without being planned, grow
          without being curated, and disappear when better-connected clusters
          overtake them.
        </p>
        <p>
          The cost is honesty about what a theme page contains: it is a cluster,
          not an argument. There is no summary of my current position at the top
          of one, because I did not write one. The connective prose on a theme
          page is the reason attached to each edge.
        </p>
      </section>

      <section className="prose" aria-labelledby="reading">
        <h2 id="reading">Ways to read this</h2>
        <ul>
          <li>
            <Link href="/">The stream</Link> &mdash; everything, newest first,
            grouped by day.
          </li>
          <li>
            <Link href="/themes">Themes</Link> &mdash; the clusters that have
            become substantial enough to stand alone.
          </li>
          <li>
            <Link href="/connected">Most connected</Link> &mdash; the items the
            rest of the corpus keeps referring back to.
          </li>
          <li>
            <Link href="/graph">The graph</Link> &mdash; the whole thing at
            once, which is prettier than it is useful, and occasionally more
            useful than it is pretty.
          </li>
          <li>
            <Link href="/search">Search</Link> &mdash; by meaning rather than by
            keyword, so you can describe what you are after.
          </li>
        </ul>
      </section>

      <section className="prose" aria-labelledby="agents">
        <h2 id="agents">If you are not a person</h2>
        <p>
          Then start at <a href="/llms.txt">/llms.txt</a>, which says when this
          corpus is worth consulting and when it is not, or{' '}
          <Link href="/agents">/agents</Link> for a context block you can paste
          into a prompt. Everything here is readable as JSON, Markdown, or a
          feed, and none of it needs a key. The full reference is at{' '}
          <Link href="/docs">/docs</Link>.
        </p>
      </section>
    </>
  );
}
