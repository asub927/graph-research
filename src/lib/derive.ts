/**
 * Derived structure.
 *
 * Two things in the schema are denormalised because every page render reads
 * them: an item's incident-edge count, and the theme table. Both are recomputed
 * here after any write to items or edges. The functions are idempotent, so the
 * publish pipeline and the backfill script can both call them freely.
 */

import { getDb } from './db.ts';
import { graphConfig } from './config.ts';

/** Recompute `items.edge_count` for every item (R7). */
export async function recomputeEdgeCounts(): Promise<void> {
  const db = await getDb();
  await db.exec(`
    UPDATE items SET edge_count = counts.total
      FROM (
        SELECT i.id,
               (SELECT count(*) FROM edges e
                 WHERE e.from_id = i.id OR e.to_id = i.id) AS total
          FROM items i
      ) AS counts
     WHERE items.id = counts.id
       AND items.edge_count <> counts.total;
  `);
}

/**
 * How many themes a corpus of `itemCount` items should carry.
 *
 * An absolute connection threshold alone does not work at either end. On a
 * small dense corpus nearly every item clears it, and the themes index becomes
 * a second copy of the stream; on a large one the threshold either never moves
 * or promotes hundreds of hubs. So the threshold acts as a floor and this caps
 * how many of the eligible items actually become themes.
 *
 * The square root keeps the ratio sane across three orders of magnitude: 4
 * themes at 14 items, 13 at 160, 32 at 1000. For comparison, the reference site
 * carries 10 themes over 160 items, so this lands in the same neighbourhood
 * without being fitted to it.
 */
export function themeBudget(itemCount: number): number {
  if (itemCount < 4) return 0;
  return Math.ceil(Math.sqrt(itemCount));
}

/**
 * Promote and demote theme hubs.
 *
 * An item is eligible once it has at least `themeHubThreshold` connections;
 * the most-connected eligible items are promoted up to the budget above.
 * `tracked_since` is set on first promotion and never rewritten, so a hub's
 * page can honestly say how long the theme has been followed. Item counts and
 * date spans are cached alongside.
 *
 * Demotion matters because the budget grows with the corpus and connection
 * counts shift as edges accumulate: without it the site would keep advertising
 * theme pages whose clusters have been overtaken.
 */
export async function recomputeThemes(): Promise<{ promoted: number; demoted: number }> {
  const db = await getDb();

  const [countRow] = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM items WHERE status = 'published'`,
  );
  const budget = themeBudget(Number(countRow?.count ?? 0));

  const promoted = await db.query<{ hub_item_id: string }>(
    `INSERT INTO themes (hub_item_id)
     SELECT id FROM items
      WHERE status = 'published' AND edge_count >= $1
      ORDER BY edge_count DESC, published_at DESC
      LIMIT $2
     ON CONFLICT (hub_item_id) DO NOTHING
     RETURNING hub_item_id`,
    [graphConfig.themeHubThreshold, budget],
  );

  // Demote anything that is no longer published, no longer clears the floor, or
  // has been pushed out of the budget by better-connected hubs.
  const demoted = await db.query<{ hub_item_id: string }>(
    `DELETE FROM themes
      WHERE hub_item_id IN (
        SELECT th.hub_item_id FROM themes th
          JOIN items i ON i.id = th.hub_item_id
         WHERE i.edge_count < $1 OR i.status <> 'published'
      )
      OR hub_item_id NOT IN (
        SELECT i.id FROM items i
         WHERE i.status = 'published' AND i.edge_count >= $1
         ORDER BY i.edge_count DESC, i.published_at DESC
         LIMIT $2
      )
     RETURNING hub_item_id`,
    [graphConfig.themeHubThreshold, budget],
  );

  // Cache each theme's membership count and published-date span. Members are
  // the hub plus its immediate neighbours, matching getThemeItems().
  await db.exec(`
    UPDATE themes SET
      item_count = stats.member_count,
      span_start = stats.span_start,
      span_end   = stats.span_end
      FROM (
        SELECT th.hub_item_id,
               count(m.id)      AS member_count,
               min(m.published_at) AS span_start,
               max(m.published_at) AS span_end
          FROM themes th
          JOIN items m ON m.status = 'published' AND (
                 m.id = th.hub_item_id
              OR m.id IN (SELECT to_id FROM edges WHERE from_id = th.hub_item_id)
              OR m.id IN (SELECT from_id FROM edges WHERE to_id = th.hub_item_id)
             )
         GROUP BY th.hub_item_id
      ) AS stats
     WHERE themes.hub_item_id = stats.hub_item_id;
  `);

  return { promoted: promoted.length, demoted: demoted.length };
}

/**
 * Drop `related_to` edges between pairs that already have a precise edge.
 *
 * Once two items are linked by something specific — one supports the other,
 * one develops into the other — also recording that they are "related" adds
 * nothing and actively hurts the page: the pair renders twice, the second time
 * under a vaguer heading with a weaker reason. The generic edge is the one that
 * goes, in either direction, because direction does not matter for relatedness.
 */
export async function pruneRedundantRelatedEdges(): Promise<number> {
  const db = await getDb();
  const removed = await db.query<{ id: string }>(`
    DELETE FROM edges
      WHERE type = 'related_to'
        AND EXISTS (
          SELECT 1 FROM edges other
           WHERE other.type <> 'related_to'
             AND (
               (other.from_id = edges.from_id AND other.to_id = edges.to_id)
               OR (other.from_id = edges.to_id AND other.to_id = edges.from_id)
             )
        )
    RETURNING id;
  `);
  return removed.length;
}

/** Run every derivation. Called after each publish and by the backfill. */
export async function recomputeDerived(): Promise<void> {
  // Pruning first, so the counts and theme budget reflect the edges that will
  // actually be rendered.
  await pruneRedundantRelatedEdges();
  await recomputeEdgeCounts();
  await recomputeThemes();
}
