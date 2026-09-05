'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { drag } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { select } from 'd3-selection';
// Imported for its side effect: d3-transition augments Selection with
// .transition(), which the focus animation below relies on.
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { EDGE_META, type EdgeType, type ItemType } from '@/lib/types';

/**
 * Force-directed view of the knowledge graph.
 *
 * One of the four places the site uses JavaScript (R16); the `<noscript>`
 * fallback on the page points at the leaderboard and theme hubs, which convey
 * the same structure without a canvas.
 *
 * `?focus={shortId}` deep-links to a node: the view zooms to it, dims
 * everything unconnected, and pins its tooltip. Because a force simulation may
 * never formally settle, the focus transform is also applied on a timer rather
 * than waiting for an `end` event that might not arrive.
 */

interface RawNode {
  id: string;
  title: string;
  type: ItemType;
  connections: number;
}

interface RawLink {
  source: string;
  target: string;
  type: EdgeType;
  reason: string;
}

interface GraphData {
  nodes: RawNode[];
  links: RawLink[];
  truncated: boolean;
  totalEdges: number;
}

type Node = RawNode & SimulationNodeDatum;
type Link = SimulationLinkDatum<Node> & { type: EdgeType; reason: string };

const WIDTH = 900;
const HEIGHT = 620;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;
/** Ceiling on the initial auto-fit zoom. Manual zoom still reaches MAX_ZOOM. */
const FIT_MAX_SCALE = 1.8;
/**
 * How long to let the simulation arrange itself before framing the result.
 *
 * A force simulation has no reliable "finished" moment — `end` fires when alpha
 * decays, which can be long after the layout is legible and, if a node is being
 * dragged, may not fire at all. So both the auto-fit and the `?focus=` zoom run
 * on a timer instead of waiting for an event that might never arrive.
 */
const SETTLE_MS = 1200;

const NODE_FILL: Record<ItemType, string> = {
  riff: 'var(--accent)',
  link: 'var(--muted)',
  essay: 'var(--link)',
};

function nodeRadius(connections: number): number {
  return 4 + Math.sqrt(connections) * 1.6;
}

interface TooltipState {
  node: Node;
  /** Offsets within the frame, already flipped to keep the box inside it. */
  placement: CSSProperties;
  pinned: boolean;
}

export function GraphView({ focusId }: { focusId?: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  /** Node pinned by `?focus=`, if any. Held in a ref so the d3 event handlers
   *  see the current value without re-running the whole effect. */
  const pinnedNodeRef = useRef<Node | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/graph/data.json')
      .then((response) => {
        if (!response.ok) throw new Error(`graph data returned ${response.status}`);
        return response.json() as Promise<GraphData>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((fetchError: Error) => {
        if (!cancelled) setError(fetchError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const nodes: Node[] = data.nodes.map((node) => ({ ...node }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: Link[] = data.links.flatMap((link) => {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      // A link whose endpoint is missing would break the simulation; the
      // payload is filtered, so this only guards against inconsistency.
      return source && target
        ? [{ source, target, type: link.type, reason: link.reason }]
        : [];
    });

    // Adjacency, used to dim everything unconnected to the hovered node.
    const neighbours = new Map<string, Set<string>>();
    for (const node of nodes) {
      neighbours.set(node.id, new Set([node.id]));
    }
    for (const link of links) {
      const source = link.source as Node;
      const target = link.target as Node;
      neighbours.get(source.id)?.add(target.id);
      neighbours.get(target.id)?.add(source.id);
    }

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const viewport = svg.append('g').attr('class', 'graph-viewport');
    const linkGroup = viewport.append('g').attr('class', 'graph-links');
    const nodeGroup = viewport.append('g').attr('class', 'graph-nodes');
    const labelGroup = viewport.append('g').attr('class', 'graph-labels');

    const linkSelection = linkGroup
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (link) => `var(--edge-${link.type})`)
      .attr('stroke-width', (link) => (link.type === 'related_to' ? 0.7 : 1.4))
      .attr('stroke-opacity', 0.55);

    const nodeSelection = nodeGroup
      .selectAll<SVGCircleElement, Node>('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'graph-node')
      .attr('r', (node) => nodeRadius(node.connections))
      .attr('fill', (node) => NODE_FILL[node.type])
      .attr('stroke', 'var(--bg)')
      .attr('stroke-width', 1)
      .attr('tabindex', 0)
      .attr('role', 'link')
      .attr('aria-label', (node) => `${node.title} — ${node.connections} connections`);

    const labelSelection = labelGroup
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('class', 'graph-label')
      .attr('text-anchor', 'middle')
      // Only label the denser nodes; labelling every node is illegible.
      .text((node) =>
        node.connections >= 3
          ? node.title.length > 34
            ? `${node.title.slice(0, 32)}…`
            : node.title
          : '',
      );

    function highlight(focus: Node | null) {
      const connected = focus ? neighbours.get(focus.id) : null;
      nodeSelection
        .attr('opacity', (node) =>
          !connected || connected.has(node.id) ? 1 : 0.12,
        )
        .attr('r', (node) =>
          focus && node.id === focus.id
            ? nodeRadius(node.connections) * 1.7
            : nodeRadius(node.connections),
        );
      linkSelection.attr('stroke-opacity', (link) => {
        if (!focus) return 0.55;
        const source = link.source as Node;
        const target = link.target as Node;
        return source.id === focus.id || target.id === focus.id ? 0.9 : 0.06;
      });
      labelSelection.attr('opacity', (node) =>
        !connected || connected.has(node.id) ? 1 : 0.1,
      );
    }

    function showTooltip(node: Node, pinned: boolean) {
      const frame = frameRef.current;
      if (!frame) return;
      // Position from the node's simulation coordinates mapped through the
      // current zoom transform, so the tooltip tracks the node when zoomed.
      const transform = currentTransform;
      const x = transform.applyX(node.x ?? 0) * (frame.clientWidth / WIDTH);
      const y = transform.applyY(node.y ?? 0) * (frame.clientHeight / HEIGHT);

      // The frame clips its overflow, so past the halfway mark the box has to
      // grow back towards the middle or it lands outside and disappears —
      // which is what a node low in the frame used to do. Anchoring the far
      // edge instead of clamping the near one means the tooltip's own height,
      // which varies with how many reasons it carries, is never measured.
      const placement: CSSProperties = {
        ...(x > frame.clientWidth / 2
          ? { right: `${frame.clientWidth - x + 12}px` }
          : { left: `${x + 12}px` }),
        ...(y > frame.clientHeight / 2
          ? { bottom: `${frame.clientHeight - y + 12}px` }
          : { top: `${y - 8}px` }),
      };

      setTooltip({ node, placement, pinned });
    }

    nodeSelection
      .on('mouseenter', (_event, node) => {
        highlight(node);
        showTooltip(node, false);
      })
      .on('mouseleave', () => {
        // A focus deep link pins a node; hovering away from a different node
        // returns to that pinned state rather than clearing the view.
        const pinned = pinnedNodeRef.current;
        if (pinned) {
          highlight(pinned);
          showTooltip(pinned, true);
          return;
        }
        highlight(null);
        setTooltip(null);
      })
      .on('focus', (_event, node) => {
        highlight(node);
        showTooltip(node, false);
      })
      .on('click', (_event, node) => {
        window.location.href = `/i/${node.id}`;
      })
      .on('keydown', (event: KeyboardEvent, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.href = `/i/${node.id}`;
        }
      });

    // --- Zoom -------------------------------------------------------------
    let currentTransform = zoomIdentity;
    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<
      SVGSVGElement,
      unknown
    >()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('zoom', (event) => {
        currentTransform = event.transform;
        viewport.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);

    // --- Simulation -------------------------------------------------------
    const simulation: Simulation<Node, Link> = forceSimulation<Node>(nodes)
      .force(
        'link',
        forceLink<Node, Link>(links)
          .id((node) => node.id)
          // Generic relatedness holds items loosely; a precise relationship
          // pulls them together, so clusters form around real arguments.
          .distance((link) => (link.type === 'related_to' ? 110 : 70))
          .strength(0.3),
      )
      .force('charge', forceManyBody<Node>().strength(-420))
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        'collide',
        // Leave room for the labels, which sit above their nodes.
        forceCollide<Node>().radius((node) => nodeRadius(node.connections) + 14),
      );

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (link) => (link.source as Node).x ?? 0)
        .attr('y1', (link) => (link.source as Node).y ?? 0)
        .attr('x2', (link) => (link.target as Node).x ?? 0)
        .attr('y2', (link) => (link.target as Node).y ?? 0);
      nodeSelection.attr('cx', (node) => node.x ?? 0).attr('cy', (node) => node.y ?? 0);
      labelSelection
        .attr('x', (node) => node.x ?? 0)
        .attr('y', (node) => (node.y ?? 0) - nodeRadius(node.connections) - 4);
    });

    nodeSelection.call(
      drag<SVGCircleElement, Node>()
        .on('start', (event, node) => {
          if (!event.active) simulation.alphaTarget(0.2).restart();
          node.fx = node.x;
          node.fy = node.y;
        })
        .on('drag', (event, node) => {
          node.fx = event.x;
          node.fy = event.y;
        })
        .on('end', (event, node) => {
          if (!event.active) simulation.alphaTarget(0);
          node.fx = null;
          node.fy = null;
        }),
    );

    // --- Focus deep link --------------------------------------------------
    /** Frame the laid-out graph so it fills the viewport, whatever its size. */
    function fitToViewport(): void {
      const xs = nodes.map((node) => node.x ?? 0);
      const ys = nodes.map((node) => node.y ?? 0);
      if (xs.length === 0) return;

      // Generous, because the bounding box is computed from node centres while
      // labels extend well past them horizontally.
      const padding = 100;
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);

      const scale = Math.max(
        MIN_ZOOM,
        Math.min(
          // Cap the initial magnification well below MAX_ZOOM. Zoom scales node
          // radii and label text along with positions, so a sparse graph
          // stretched to fill the frame reads as broken rather than detailed.
          FIT_MAX_SCALE,
          Math.min((WIDTH - padding * 2) / spanX, (HEIGHT - padding * 2) / spanY),
        ),
      );

      const transform = zoomIdentity
        .translate(WIDTH / 2, HEIGHT / 2)
        .scale(scale)
        .translate(-(minX + spanX / 2), -(minY + spanY / 2));

      svg.transition().duration(400).call(zoomBehavior.transform, transform);
      currentTransform = transform;
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    pinnedNodeRef.current = null;
    const focusTarget = focusId ? byId.get(focusId) : undefined;

    if (focusTarget) {
      pinnedNodeRef.current = focusTarget;
      timers.push(
        setTimeout(() => {
          const transform = zoomIdentity
            .translate(WIDTH / 2, HEIGHT / 2)
            .scale(1.9)
            .translate(-(focusTarget.x ?? WIDTH / 2), -(focusTarget.y ?? HEIGHT / 2));
          svg.transition().duration(600).call(zoomBehavior.transform, transform);
          currentTransform = transform;
          highlight(focusTarget);
          // Pin the tooltip after the transition so it lands in place.
          timers.push(setTimeout(() => showTooltip(focusTarget, true), 620));
        }, SETTLE_MS),
      );
    } else {
      timers.push(setTimeout(fitToViewport, SETTLE_MS));
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
      pinnedNodeRef.current = null;
      simulation.stop();
      svg.on('.zoom', null);
      svg.selectAll('*').remove();
    };
  }, [data, focusId]);

  if (error) {
    return (
      <div className="callout" role="alert">
        <p>The graph data could not be loaded ({error}).</p>
        <p>
          <a href="/connected">Most connected</a> and{' '}
          <a href="/themes">themes</a> present the same structure without the
          visualisation.
        </p>
      </div>
    );
  }

  const tooltipReasons = tooltip
    ? (data?.links ?? [])
        .filter(
          (link) =>
            link.type !== 'related_to' &&
            (link.source === tooltip.node.id || link.target === tooltip.node.id),
        )
        .slice(0, 3)
    : [];

  return (
    <>
      <div className="graph-frame" ref={frameRef}>
        <svg
          className="graph-canvas"
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={
            data
              ? `Force-directed graph of ${data.nodes.length} items and ${data.links.length} connections`
              : 'Loading graph'
          }
        />
        {tooltip ? (
          <div className="graph-tooltip" style={tooltip.placement}>
            <div className="graph-tooltip-title">{tooltip.node.title}</div>
            <div className="graph-tooltip-meta">
              {tooltip.node.type} &middot; {tooltip.node.connections} connection
              {tooltip.node.connections === 1 ? '' : 's'}
            </div>
            {tooltipReasons.length > 0 ? (
              <ul>
                {tooltipReasons.map((link, index) => (
                  <li key={index}>{link.reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="graph-legend">
        {(Object.keys(EDGE_META) as EdgeType[]).map((type) => (
          <li key={type}>
            <span
              className="graph-swatch"
              style={{ background: `var(--edge-${type})` }}
              aria-hidden="true"
            />
            {EDGE_META[type].legendLabel}
          </li>
        ))}
      </ul>

      {data ? (
        <p className="page-intro" style={{ marginTop: '0.85rem' }}>
          {data.nodes.length} items, {data.links.length} connections shown
          {data.truncated
            ? ` of ${data.totalEdges} total — one link per pair, highest confidence first`
            : ''}
          . Drag to rearrange, scroll to zoom, click a node to open it.
        </p>
      ) : (
        <p className="page-intro">Loading the graph…</p>
      )}
    </>
  );
}
