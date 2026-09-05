import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Database-backed tests.
 *
 * These run against a throwaway PGlite database in a temp directory, so they
 * exercise the real SQL — the theme membership CTE, the conditional section
 * filter, the redundancy prune — rather than a mock. `PGLITE_DATA_DIR` is set
 * before any query runs, because the driver resolves it lazily on first use.
 */

const dataDir = await mkdtemp(join(tmpdir(), 'fyi-test-'));
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
// Keep the promotion floor low so small fixtures can produce hubs.
process.env.THEME_HUB_THRESHOLD = '2';

const { query } = await import('../src/lib/db.ts');
const { migrate } = await import('../scripts/migrate.ts');
const {
  getConnections,
  getTheme,
  getThemeEdgePairs,
  getThemeItems,
  getThemes,
  getEdgesByType,
  listItems,
  searchItems,
} = await import('../src/lib/queries.ts');
const { pruneRedundantRelatedEdges, recomputeDerived, recomputeEdgeCounts } =
  await import('../src/lib/derive.ts');
const { edgeTypesForSection } = await import('../src/lib/types.ts');

/** Fixture item ids, keyed by a readable name. */
const ids = new Map<string, string>();

function idOf(name: string): string {
  const id = ids.get(name);
  if (!id) throw new Error(`unknown fixture item: ${name}`);
  return id;
}

async function addItem(
  name: string,
  options: { type?: string; day?: string; title?: string } = {},
): Promise<void> {
  const id = randomUUID();
  ids.set(name, id);
  await query(
    `INSERT INTO items (id, short_id, type, title, content, url, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      id.slice(0, 8),
      options.type ?? 'link',
      options.title ?? name,
      `> Summary of ${name}.`,
      options.type === 'riff' ? null : `https://example.com/${encodeURIComponent(name)}`,
      `${options.day ?? '2026-08-01'}T12:00:00.000Z`,
    ],
  );
}

async function addEdge(
  from: string,
  to: string,
  type: string,
  confidence = 0.8,
  origin: 'generated' | 'asserted' = 'generated',
) {
  await query(
    `INSERT INTO edges (id, from_id, to_id, type, confidence, reason, origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (from_id, to_id, type) DO NOTHING`,
    [
      randomUUID(),
      idOf(from),
      idOf(to),
      type,
      confidence,
      `Because of ${type}.`,
      origin,
    ],
  );
}

before(async () => {
  await migrate();

  // Two clusters. "hub-a" accumulates a challenge and a development line;
  // "hub-b" accumulates only supports, so its theme page must show neither
  // conditional section.
  await addItem('hub-a', { day: '2026-08-01' });
  await addItem('a-challenger', { day: '2026-08-05' });
  await addItem('a-earlier', { day: '2026-08-03', type: 'riff' });
  await addItem('a-neighbour', { day: '2026-08-07' });
  await addItem('hub-b', { day: '2026-08-10' });
  await addItem('b-supporter-1', { day: '2026-08-12' });
  await addItem('b-supporter-2', { day: '2026-08-14' });
  await addItem('orphan', { day: '2026-08-20' });

  await addEdge('a-challenger', 'hub-a', 'challenges', 0.9);
  await addEdge('a-earlier', 'hub-a', 'develops_into', 0.85);
  await addEdge('a-neighbour', 'hub-a', 'related_to', 0.6);
  // An edge between two cluster members that does not touch the hub: it still
  // belongs in the hub's Tensions section, because both endpoints are members.
  await addEdge('a-challenger', 'a-neighbour', 'corrected_by', 0.7);

  await addEdge('b-supporter-1', 'hub-b', 'supports', 0.9);
  await addEdge('b-supporter-2', 'hub-b', 'supports', 0.88);

  await recomputeDerived();
});

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('theme membership', () => {
  it('includes the hub plus everything directly connected to it', async () => {
    const items = await getThemeItems(idOf('hub-a'));
    const titles = items.map((item) => item.title).sort();
    assert.deepEqual(titles, ['a-challenger', 'a-earlier', 'a-neighbour', 'hub-a']);
  });

  it('orders theme items newest first for day grouping', async () => {
    const items = await getThemeItems(idOf('hub-a'));
    const dates = items.map((item) => item.publishedAt.getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  });

  it('excludes items with no edge to the hub', async () => {
    const items = await getThemeItems(idOf('hub-a'));
    assert.ok(!items.some((item) => item.title === 'orphan'));
  });
});

describe('conditional theme sections', () => {
  it('surfaces tensions when the cluster contains challenging edges', async () => {
    const tensions = await getThemeEdgePairs(
      idOf('hub-a'),
      edgeTypesForSection('tensions'),
    );
    assert.equal(tensions.length, 2);
    assert.deepEqual(tensions.map((pair) => pair.type).sort(), [
      'challenges',
      'corrected_by',
    ]);
  });

  it('includes cluster-internal edges that do not touch the hub', async () => {
    const tensions = await getThemeEdgePairs(
      idOf('hub-a'),
      edgeTypesForSection('tensions'),
    );
    const corrected = tensions.find((pair) => pair.type === 'corrected_by');
    assert.ok(corrected);
    assert.equal(corrected.from.title, 'a-challenger');
    assert.equal(corrected.to.title, 'a-neighbour');
  });

  it('surfaces development lines when the cluster contains them', async () => {
    const development = await getThemeEdgePairs(
      idOf('hub-a'),
      edgeTypesForSection('development'),
    );
    assert.equal(development.length, 1);
    assert.equal(development[0]!.type, 'develops_into');
  });

  it('returns nothing for a cluster with no edges of those types', async () => {
    // hub-b has only `supports` edges, so both sections must stay empty and the
    // page renders neither heading.
    const tensions = await getThemeEdgePairs(
      idOf('hub-b'),
      edgeTypesForSection('tensions'),
    );
    const development = await getThemeEdgePairs(
      idOf('hub-b'),
      edgeTypesForSection('development'),
    );
    assert.deepEqual(tensions, []);
    assert.deepEqual(development, []);
  });

  it('returns nothing when asked for no types at all', async () => {
    assert.deepEqual(await getThemeEdgePairs(idOf('hub-a'), []), []);
  });
});

describe('connections from an item’s point of view', () => {
  it('reports direction so the label can be inverted', async () => {
    const connections = await getConnections(idOf('hub-a'));
    const challenge = connections.find((edge) => edge.type === 'challenges');
    assert.ok(challenge);
    // The challenge points at the hub, so from the hub it is incoming and
    // renders as "Challenged by".
    assert.equal(challenge.direction, 'incoming');
    assert.equal(challenge.otherTitle, 'a-challenger');
  });

  it('merges backlinks into the same connection list', async () => {
    const connections = await getConnections(idOf('hub-a'));
    assert.equal(connections.length, 3);
    assert.ok(connections.every((edge) => edge.direction === 'incoming'));
  });

  it('sorts high-signal types ahead of generic relatedness', async () => {
    const connections = await getConnections(idOf('hub-a'));
    assert.equal(connections.at(-1)!.type, 'related_to');
  });
});

describe('derived counts and theme promotion', () => {
  it('counts edges in both directions', async () => {
    await recomputeEdgeCounts();
    const [hub] = await query<{ edge_count: number }>(
      'SELECT edge_count FROM items WHERE id = $1',
      [idOf('hub-a')],
    );
    assert.equal(Number(hub!.edge_count), 3);
  });

  it('leaves unconnected items at zero', async () => {
    const [orphan] = await query<{ edge_count: number }>(
      'SELECT edge_count FROM items WHERE id = $1',
      [idOf('orphan')],
    );
    assert.equal(Number(orphan!.edge_count), 0);
  });

  it('promotes hubs and caches their span', async () => {
    const theme = await getTheme(idOf('hub-a').slice(0, 8));
    assert.ok(theme);
    assert.equal(theme.itemCount, 4);
    assert.equal(theme.spanStart.toISOString().slice(0, 10), '2026-08-01');
    assert.equal(theme.spanEnd.toISOString().slice(0, 10), '2026-08-07');
  });

  it('never promotes an unconnected item', async () => {
    const themes = await getThemes();
    assert.ok(!themes.some((theme) => theme.title === 'orphan'));
  });

  it('demotes a hub once its edges are gone', async () => {
    await query('DELETE FROM edges WHERE to_id = $1', [idOf('hub-b')]);
    await recomputeDerived();
    assert.equal(await getTheme(idOf('hub-b').slice(0, 8)), null);
    // Restore for any later assertions.
    await addEdge('b-supporter-1', 'hub-b', 'supports', 0.9);
    await addEdge('b-supporter-2', 'hub-b', 'supports', 0.88);
    await recomputeDerived();
  });
});

describe('redundant edge pruning', () => {
  it('drops related_to where a precise edge already links the pair', async () => {
    await addEdge('a-challenger', 'hub-a', 'related_to', 0.6);
    const removed = await pruneRedundantRelatedEdges();
    assert.ok(removed >= 1);

    const connections = await getConnections(idOf('hub-a'));
    const toChallenger = connections.filter(
      (edge) => edge.otherTitle === 'a-challenger',
    );
    // One edge for the pair, and it is the specific one.
    assert.equal(toChallenger.length, 1);
    assert.equal(toChallenger[0]!.type, 'challenges');
  });

  it('prunes regardless of which direction the generic edge points', async () => {
    await addEdge('hub-a', 'a-earlier', 'related_to', 0.6);
    await pruneRedundantRelatedEdges();
    const pairs = await getEdgesByType('related_to');
    assert.ok(
      !pairs.some(
        (pair) =>
          (pair.from.title === 'hub-a' && pair.to.title === 'a-earlier') ||
          (pair.from.title === 'a-earlier' && pair.to.title === 'hub-a'),
      ),
    );
  });

  it('keeps related_to where it is the only link between a pair', async () => {
    const pairs = await getEdgesByType('related_to');
    assert.ok(
      pairs.some(
        (pair) => pair.from.title === 'a-neighbour' && pair.to.title === 'hub-a',
      ),
    );
  });

  it('leaves a hand-asserted related_to alone even when it is redundant', async () => {
    // Same shape as the first case, but asserted rather than generated. The
    // prune is a cleanup of the pipeline's own output and has no business
    // overruling a link someone made deliberately.
    await addEdge('b-supporter-1', 'hub-b', 'related_to', 0.6, 'asserted');
    await pruneRedundantRelatedEdges();

    const connections = await getConnections(idOf('hub-b'));
    const toSupporter = connections.filter(
      (edge) => edge.otherTitle === 'b-supporter-1',
    );
    assert.deepEqual(
      toSupporter.map((edge) => edge.type).sort(),
      ['related_to', 'supports'],
    );
  });
});

describe('listing and search', () => {
  it('filters by type', async () => {
    const riffs = await listItems({ type: 'riff', limit: 10, offset: 0 });
    assert.equal(riffs.total, 1);
    assert.equal(riffs.items[0]!.title, 'a-earlier');
  });

  it('filters by date and reports whether more remain', async () => {
    const recent = await listItems({ since: '2026-08-10', limit: 2, offset: 0 });
    assert.equal(recent.total, 4);
    assert.equal(recent.items.length, 2);
    assert.equal(recent.hasMore, true);

    const rest = await listItems({ since: '2026-08-10', limit: 2, offset: 2 });
    assert.equal(rest.hasMore, false);
  });

  it('matches keywords against title and content', async () => {
    const results = await searchItems('orphan');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.title, 'orphan');
  });

  it('returns nothing for a keyword that appears nowhere', async () => {
    assert.deepEqual(await searchItems('chromodynamics'), []);
  });
});
