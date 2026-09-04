import Link from 'next/link';
import { EDGE_META, type EdgePair, type EdgeType, type ResolvedEdge } from '@/lib/types';
import { groupConnections } from '@/lib/queries';

/**
 * Typed connections, rendered as prose.
 *
 * This is the site's central feature. Each connection shows the related item
 * and the written reason for the link (R3), grouped under a heading that reads
 * in the active voice for outgoing edges and the passive voice for incoming
 * ones (R4) — so a backlink appears as "Supported by" without needing a
 * separate section.
 */

function edgeColourStyle(type: EdgeType) {
  return { '--edge-colour': `var(--edge-${type})` } as React.CSSProperties;
}

export function Connections({ connections }: { connections: readonly ResolvedEdge[] }) {
  if (connections.length === 0) return null;

  const groups = groupConnections(connections);

  return (
    <section className="connections" id="connections" aria-labelledby="connections-heading">
      <h2 className="connections-heading" id="connections-heading">
        Connections
      </h2>
      <p className="connections-note">
        {connections.length} connection{connections.length === 1 ? '' : 's'}. Each
        reason states how the two items bear on each other.
      </p>

      {groups.map((group) => (
        <div
          className="connection-group"
          key={`${group.type}-${group.label}`}
          style={edgeColourStyle(group.type)}
        >
          <h3 className="connection-label">{group.label}</h3>
          <ul className="connection-list">
            {group.edges.map((edge) => (
              <li key={edge.edgeId}>
                <Link className="connection-title" href={`/i/${edge.otherShortId}`}>
                  {edge.otherTitle ?? `Item ${edge.otherShortId}`}
                </Link>
                <span className="connection-reason">
                  {edge.reason}{' '}
                  <span
                    className="connection-confidence"
                    title="Confidence that this relationship holds"
                  >
                    ({edge.confidence.toFixed(2)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * A theme section built from edges whose endpoints are both in the cluster.
 *
 * Rendered as `A <separator> B — reason`, with the separator carrying the
 * relationship: "vs" for a tension, an arrow for a line of development. The
 * caller only mounts this when there are pairs to show, which is what makes the
 * sections conditional (R6).
 */
export function EdgePairList({
  pairs,
  headingId,
}: {
  pairs: readonly EdgePair[];
  headingId?: string;
}) {
  return (
    <ul className="pair-list" aria-labelledby={headingId}>
      {pairs.map((pair) => (
        <li key={pair.edgeId} style={edgeColourStyle(pair.type)}>
          <span className="pair-heading">
            <Link href={`/i/${pair.from.shortId}`}>
              {pair.from.title ?? `Item ${pair.from.shortId}`}
            </Link>
            <span className="pair-separator"> {EDGE_META[pair.type].pairSeparator} </span>
            <Link href={`/i/${pair.to.shortId}`}>
              {pair.to.title ?? `Item ${pair.to.shortId}`}
            </Link>
          </span>
          <span className="connection-reason">{pair.reason}</span>
        </li>
      ))}
    </ul>
  );
}
