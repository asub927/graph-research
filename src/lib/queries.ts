/**
 * Every read the site performs.
 *
 * Rows come back snake_cased, and the two drivers disagree about scalar
 * coercion — `pg` hands back `numeric` as a string while PGlite may hand back a
 * number, and either may hand back a timestamp as a string. The `coerce*`
 * helpers normalise that at the boundary so nothing downstream has to care.
 */

import { query, queryOne, toVector } from './db.ts';
import { graphConfig, site } from './config.ts';
import {
  EDGE_META,
  type EdgePair,
  type EdgeType,
  type Item,
  type ItemType,
  type ResolvedEdge,
  type ScoredItem,
  type Theme,
} from './types.ts';
import { isUuid } from './shortid.ts';

function coerceDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function coerceOptionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : coerceDate(value);
}

function coerceNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number.parseFloat(String(value));
}

function coerceTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  // PGlite can return an array literal rather than a parsed array.
  if (typeof value === 'string' && value.startsWith('{')) {
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((tag) => tag.replace(/^"|"$/g, ''));
  }
  return [];
}

interface ItemRow {
  id: string;
  short_id: string;
  type: string;
  title: string | null;
  content: string;
  url: string | null;
  tags: unknown;
  published_at: unknown;
  updated_at: unknown;
  edge_count: unknown;
}

function mapItem(row: ItemRow): Item {
  return {
    id: row.id,
    shortId: row.short_id,
    type: row.type as ItemType,
    title: row.title,
    content: row.content,
    url: row.url,
    tags: coerceTags(row.tags),
    publishedAt: coerceDate(row.published_at),
    updatedAt: coerceOptionalDate(row.updated_at),
    edgeCount: coerceNumber(row.edge_count ?? 0),
  };
}

const ITEM_COLUMNS = `
  id, short_id, type, title, content, url, tags,
  published_at, updated_at, edge_count
`;

const PUBLISHED = `status = 'published'`;

// --- Stream -----------------------------------------------------------------

export interface StreamPage {
  items: Item[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export async function countPublishedItems(): Promise<number> {
  const row = await queryOne<{ count: unknown }>(
    `SELECT count(*) AS count FROM items WHERE ${PUBLISHED}`,
  );
  return coerceNumber(row?.count ?? 0);
}

/** One page of the reverse-chronological stream. `page` is 1-based (R8). */
export async function getStreamPage(page: number): Promise<StreamPage> {
  const totalItems = await countPublishedItems();
  const totalPages = Math.max(1, Math.ceil(totalItems / site.pageSize));
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
     WHERE ${PUBLISHED}
     ORDER BY published_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [site.pageSize, (page - 1) * site.pageSize],
  );
  return { items: rows.map(mapItem), page, totalPages, totalItems };
}

/**
 * Every published item, newest first. Backs the feeds, `llms.txt`, the sitemap,
 * the graph payload, and `/random`.
 */
export async function getAllPublishedItems(limit?: number): Promise<Item[]> {
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
     WHERE ${PUBLISHED}
     ORDER BY published_at DESC, id DESC
     ${limit === undefined ? '' : 'LIMIT $1'}`,
    limit === undefined ? [] : [limit],
  );
  return rows.map(mapItem);
}

export async function getRecentItems(limit = 10): Promise<Item[]> {
  return getAllPublishedItems(limit);
}

export async function getLatestPublishedAt(): Promise<Date | null> {
  const row = await queryOne<{ published_at: unknown }>(
    `SELECT published_at FROM items WHERE ${PUBLISHED}
     ORDER BY published_at DESC LIMIT 1`,
  );
  return row ? coerceDate(row.published_at) : null;
}

// --- Single item ------------------------------------------------------------

/** Look up by short id or full UUID; both are public identifiers (R20). */
export async function getItem(identifier: string): Promise<Item | null> {
  const column = isUuid(identifier) ? 'id' : 'short_id';
  const row = await queryOne<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
     WHERE ${column} = $1 AND ${PUBLISHED}`,
    [isUuid(identifier) ? identifier : identifier.toLowerCase()],
  );
  return row ? mapItem(row) : null;
}

/**
 * Connections for one item, from that item's point of view.
 *
 * Outgoing and incoming edges are unioned into a single list, each carrying the
 * direction so the caller can pick the active or passive label (R4). Ordering
 * is by the edge type's render weight, then by confidence, so the high-signal
 * relationships surface first and `related_to` sinks to the bottom.
 */
export async function getConnections(itemId: string): Promise<ResolvedEdge[]> {
  interface Row {
    edge_id: string;
    type: string;
    direction: string;
    confidence: unknown;
    reason: string;
    other_id: string;
    other_short_id: string;
    other_title: string | null;
    other_type: string;
  }

  const rows = await query<Row>(
    `SELECT e.id AS edge_id, e.type, 'outgoing' AS direction, e.confidence, e.reason,
            other.id AS other_id, other.short_id AS other_short_id,
            other.title AS other_title, other.type AS other_type
       FROM edges e
       JOIN items other ON other.id = e.to_id
      WHERE e.from_id = $1 AND other.status = 'published'
     UNION ALL
     SELECT e.id AS edge_id, e.type, 'incoming' AS direction, e.confidence, e.reason,
            other.id AS other_id, other.short_id AS other_short_id,
            other.title AS other_title, other.type AS other_type
       FROM edges e
       JOIN items other ON other.id = e.from_id
      WHERE e.to_id = $1 AND other.status = 'published'`,
    [itemId],
  );

  return rows
    .map((row) => ({
      edgeId: row.edge_id,
      type: row.type as EdgeType,
      direction: row.direction as 'incoming' | 'outgoing',
      confidence: coerceNumber(row.confidence),
      reason: row.reason,
      otherId: row.other_id,
      otherShortId: row.other_short_id,
      otherTitle: row.other_title,
      otherType: row.other_type as ItemType,
    }))
    .sort(
      (a, b) =>
        EDGE_META[a.type].weight - EDGE_META[b.type].weight ||
        b.confidence - a.confidence,
    );
}

/**
 * Group connections under their directional heading.
 *
 * `related_to` reads the same in both directions, so its two groups collapse
 * into one; every other type yields a separate active and passive group.
 */
export function groupConnections(
  connections: readonly ResolvedEdge[],
): Array<{ label: string; type: EdgeType; edges: ResolvedEdge[] }> {
  const groups = new Map<string, { label: string; type: EdgeType; edges: ResolvedEdge[] }>();

  for (const edge of connections) {
    const meta = EDGE_META[edge.type];
    const label =
      edge.direction === 'outgoing' ? meta.outgoingLabel : meta.incomingLabel;
    const key = `${edge.type}:${label}`;
    const existing = groups.get(key);
    if (existing) {
      existing.edges.push(edge);
    } else {
      groups.set(key, { label, type: edge.type, edges: [edge] });
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      EDGE_META[a.type].weight - EDGE_META[b.type].weight ||
      a.label.localeCompare(b.label),
  );
}

// --- Search -----------------------------------------------------------------

export async function searchItems(keyword: string, limit = 50): Promise<Item[]> {
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
      WHERE ${PUBLISHED} AND search_vector @@ plainto_tsquery('english', $1)
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC,
               published_at DESC
      LIMIT $2`,
    [keyword, limit],
  );
  return rows.map(mapItem);
}

/**
 * Nearest neighbours by embedding. `<=>` is pgvector's cosine distance, so
 * similarity is `1 - distance`.
 */
export async function semanticSearch(
  embedding: number[],
  limit = 10,
  excludeId?: string,
): Promise<ScoredItem[]> {
  interface Row extends ItemRow {
    distance: unknown;
  }

  const rows = await query<Row>(
    `SELECT ${ITEM_COLUMNS}, (embedding <=> $1) AS distance
       FROM items
      WHERE ${PUBLISHED}
        AND embedding IS NOT NULL
        ${excludeId ? 'AND id <> $3' : ''}
      ORDER BY embedding <=> $1
      LIMIT $2`,
    excludeId ? [toVector(embedding), limit, excludeId] : [toVector(embedding), limit],
  );

  return rows.map((row) => ({
    ...mapItem(row),
    score: Math.max(0, Math.min(1, 1 - coerceNumber(row.distance))),
  }));
}

// --- Edges ------------------------------------------------------------------

interface PairRow {
  edge_id: string;
  type: string;
  reason: string;
  confidence: unknown;
  from_short_id: string;
  from_title: string | null;
  to_short_id: string;
  to_title: string | null;
}

function mapPair(row: PairRow): EdgePair {
  return {
    edgeId: row.edge_id,
    type: row.type as EdgeType,
    reason: row.reason,
    confidence: coerceNumber(row.confidence),
    from: { shortId: row.from_short_id, title: row.from_title },
    to: { shortId: row.to_short_id, title: row.to_title },
  };
}

const PAIR_SELECT = `
  SELECT e.id AS edge_id, e.type, e.reason, e.confidence,
         f.short_id AS from_short_id, f.title AS from_title,
         t.short_id AS to_short_id, t.title AS to_title
    FROM edges e
    JOIN items f ON f.id = e.from_id AND f.status = 'published'
    JOIN items t ON t.id = e.to_id AND t.status = 'published'
`;

export async function getEdgesByType(type: EdgeType, limit = 500): Promise<EdgePair[]> {
  const rows = await query<PairRow>(
    `${PAIR_SELECT} WHERE e.type = $1 ORDER BY e.confidence DESC LIMIT $2`,
    [type, limit],
  );
  return rows.map(mapPair);
}

export async function countEdges(): Promise<number> {
  const row = await queryOne<{ count: unknown }>('SELECT count(*) AS count FROM edges');
  return coerceNumber(row?.count ?? 0);
}

export async function getEdgeTypeHistogram(): Promise<Record<string, number>> {
  const rows = await query<{ type: string; count: unknown }>(
    'SELECT type, count(*) AS count FROM edges GROUP BY type ORDER BY count DESC',
  );
  return Object.fromEntries(rows.map((row) => [row.type, coerceNumber(row.count)]));
}

// --- Leaderboard and graph --------------------------------------------------

export async function getMostConnected(limit = 60): Promise<Item[]> {
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
      WHERE ${PUBLISHED} AND edge_count > 0
      ORDER BY edge_count DESC, published_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(mapItem);
}

export interface GraphPayload {
  nodes: Array<{
    id: string;
    title: string;
    type: ItemType;
    connections: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    type: EdgeType;
    reason: string;
  }>;
  truncated: boolean;
  totalEdges: number;
}

/**
 * Data for the graph visualisation.
 *
 * Edges are capped by `graphEdgeBudget` and selected highest-confidence first,
 * and only one link is kept per node pair so a heavily cross-referenced pair
 * does not render as a bundle of parallel lines. The reference site applies a
 * similar reduction — dropping roughly two thirds of its edges — but does so
 * silently; we report whether truncation happened so the page can say so.
 */
export async function getGraphPayload(): Promise<GraphPayload> {
  const [items, totalEdges] = await Promise.all([getAllPublishedItems(), countEdges()]);

  interface Row {
    type: string;
    reason: string;
    from_short_id: string;
    to_short_id: string;
  }

  const rows = await query<Row>(
    `SELECT e.type, e.reason,
            f.short_id AS from_short_id, t.short_id AS to_short_id
       FROM edges e
       JOIN items f ON f.id = e.from_id AND f.status = 'published'
       JOIN items t ON t.id = e.to_id AND t.status = 'published'
      ORDER BY e.confidence DESC`,
  );

  const seenPairs = new Set<string>();
  const links: GraphPayload['links'] = [];

  for (const row of rows) {
    const pairKey = [row.from_short_id, row.to_short_id].sort().join(':');
    if (seenPairs.has(pairKey)) continue;
    if (links.length >= graphConfig.graphEdgeBudget) break;
    seenPairs.add(pairKey);
    links.push({
      source: row.from_short_id,
      target: row.to_short_id,
      type: row.type as EdgeType,
      reason: row.reason,
    });
  }

  return {
    nodes: items.map((item) => ({
      id: item.shortId,
      title: item.title ?? 'Untitled',
      type: item.type,
      connections: item.edgeCount,
    })),
    links,
    truncated: links.length < rows.length,
    totalEdges,
  };
}

// --- Themes -----------------------------------------------------------------

interface ThemeRow {
  short_id: string;
  hub_item_id: string;
  title: string | null;
  item_count: unknown;
  tracked_since: unknown;
  span_start: unknown;
  span_end: unknown;
}

function mapTheme(row: ThemeRow): Theme {
  return {
    shortId: row.short_id,
    hubItemId: row.hub_item_id,
    title: row.title,
    itemCount: coerceNumber(row.item_count),
    trackedSince: coerceDate(row.tracked_since),
    spanStart: coerceDate(row.span_start ?? row.tracked_since),
    spanEnd: coerceDate(row.span_end ?? row.tracked_since),
  };
}

const THEME_SELECT = `
  SELECT i.short_id, th.hub_item_id, i.title, th.item_count,
         th.tracked_since, th.span_start, th.span_end
    FROM themes th
    JOIN items i ON i.id = th.hub_item_id AND i.status = 'published'
`;

export async function getThemes(): Promise<Theme[]> {
  const rows = await query<ThemeRow>(
    `${THEME_SELECT} ORDER BY th.item_count DESC, i.published_at DESC`,
  );
  return rows.map(mapTheme);
}

export async function getTheme(shortId: string): Promise<Theme | null> {
  const row = await queryOne<ThemeRow>(`${THEME_SELECT} WHERE i.short_id = $1`, [
    shortId.toLowerCase(),
  ]);
  return row ? mapTheme(row) : null;
}

/**
 * The items belonging to a theme: the hub itself plus everything directly
 * connected to it (R5). Newest first, for day-grouped rendering.
 */
export async function getThemeItems(hubItemId: string): Promise<Item[]> {
  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items
      WHERE ${PUBLISHED}
        AND (
          id = $1
          OR id IN (SELECT to_id FROM edges WHERE from_id = $1)
          OR id IN (SELECT from_id FROM edges WHERE to_id = $1)
        )
      ORDER BY published_at DESC, id DESC`,
    [hubItemId],
  );
  return rows.map(mapItem);
}

/**
 * Edges of the given types that fall entirely inside a theme's cluster.
 *
 * This is what fills the conditional Tensions and Lines of development sections
 * (R6): both endpoints must be theme members, so a section only appears when
 * the cluster genuinely contains that kind of relationship.
 */
export async function getThemeEdgePairs(
  hubItemId: string,
  types: readonly EdgeType[],
  limit = 40,
): Promise<EdgePair[]> {
  if (types.length === 0) return [];

  const rows = await query<PairRow>(
    `WITH members AS (
       SELECT $1::uuid AS id
       UNION SELECT to_id FROM edges WHERE from_id = $1
       UNION SELECT from_id FROM edges WHERE to_id = $1
     )
     ${PAIR_SELECT}
      WHERE e.type = ANY($2)
        AND e.from_id IN (SELECT id FROM members)
        AND e.to_id IN (SELECT id FROM members)
      ORDER BY e.confidence DESC
      LIMIT $3`,
    [hubItemId, [...types], limit],
  );
  return rows.map(mapPair);
}

// --- Summary ----------------------------------------------------------------

export interface GraphSummary {
  totalItems: number;
  totalEdges: number;
  edgeTypes: Record<string, number>;
  topConnected: Array<{
    shortId: string;
    title: string | null;
    permalink: string;
    connections: number;
  }>;
  recentItems: Array<{
    shortId: string;
    title: string | null;
    type: ItemType;
    permalink: string;
    publishedAt: string;
  }>;
  tensions: EdgePair[];
  generatedAt: string;
}

/** Point-in-time snapshot backing `/api/fyi/q/summary`. */
export async function getGraphSummary(): Promise<GraphSummary> {
  const [totalItems, totalEdges, edgeTypes, topConnected, recentItems, tensions] =
    await Promise.all([
      countPublishedItems(),
      countEdges(),
      getEdgeTypeHistogram(),
      getMostConnected(10),
      getRecentItems(10),
      getEdgesByType('challenges', 25),
    ]);

  return {
    totalItems,
    totalEdges,
    edgeTypes,
    topConnected: topConnected.map((item) => ({
      shortId: item.shortId,
      title: item.title,
      permalink: `${site.url}/i/${item.shortId}`,
      connections: item.edgeCount,
    })),
    recentItems: recentItems.map((item) => ({
      shortId: item.shortId,
      title: item.title,
      type: item.type,
      permalink: `${site.url}/i/${item.shortId}`,
      publishedAt: item.publishedAt.toISOString().slice(0, 10),
    })),
    tensions,
    generatedAt: new Date().toISOString(),
  };
}

// --- Filtered listing -------------------------------------------------------

export interface ListItemsOptions {
  since?: string;
  type?: ItemType;
  limit: number;
  offset: number;
}

export interface PagedItems {
  items: Item[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export async function listItems(options: ListItemsOptions): Promise<PagedItems> {
  const filters: string[] = [PUBLISHED];
  const params: unknown[] = [];

  if (options.since) {
    params.push(options.since);
    filters.push(`published_at >= $${params.length}::date`);
  }
  if (options.type) {
    params.push(options.type);
    filters.push(`type = $${params.length}`);
  }

  const where = filters.join(' AND ');
  const totalRow = await queryOne<{ count: unknown }>(
    `SELECT count(*) AS count FROM items WHERE ${where}`,
    params,
  );
  const total = coerceNumber(totalRow?.count ?? 0);

  const rows = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM items WHERE ${where}
      ORDER BY published_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, options.limit, options.offset],
  );

  return {
    items: rows.map(mapItem),
    total,
    hasMore: options.offset + rows.length < total,
    offset: options.offset,
    limit: options.limit,
  };
}
