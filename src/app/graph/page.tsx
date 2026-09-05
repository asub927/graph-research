import type { Metadata } from 'next';
import Link from 'next/link';
import { GraphView } from '@/components/GraphView';
import { countEdges, countPublishedItems, getMostConnected } from '@/lib/queries';
import { pageMetadata } from '@/lib/seo';
import { isShortId } from '@/lib/shortid';

export const metadata: Metadata = pageMetadata({
  title: 'Graph',
  description:
    'Force-directed view of the typed connections between items. Drag to ' +
    'rearrange, zoom to explore, click a node to open it.',
  path: '/graph',
});

interface PageProps {
  searchParams: Promise<{ focus?: string }>;
}

export default async function GraphPage({ searchParams }: PageProps) {
  const { focus } = await searchParams;
  const focusId = focus && isShortId(focus) ? focus.toLowerCase() : undefined;

  const [items, edges, dense] = await Promise.all([
    countPublishedItems(),
    countEdges(),
    getMostConnected(12),
  ]);

  return (
    <div>
      <h1 className="page-title">Graph</h1>
      <p className="page-intro">
        {items} items and {edges} typed connections. Node size tracks connection
        count; line colour tracks relationship type. Treat this as a navigation
        aid rather than an analysis &mdash; a force layout puts things near each
        other because of the physics, not because the data says they belong
        together.
      </p>

      <GraphView focusId={focusId} />

      {/* R16: the visualisation needs JavaScript, so the same structure is
          reachable without it. */}
      <noscript>
        <div className="callout">
          <p>
            The graph needs JavaScript. The densest nodes are listed below, and{' '}
            <Link href="/connected">most connected</Link> ranks them all.{' '}
            <Link href="/themes">Themes</Link> groups them into clusters.
          </p>
          <ol className="ranked-list">
            {dense.map((item) => (
              <li key={item.id}>
                <span className="ranked-count">
                  <span className="edge-badge">{item.edgeCount}</span>
                </span>
                <span className="ranked-body">
                  <Link className="ranked-title" href={`/i/${item.shortId}`}>
                    {item.title ?? `Item ${item.shortId}`}
                  </Link>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </noscript>
    </div>
  );
}
