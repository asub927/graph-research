import { query, queryOne, toVector } from './db.ts';
import { newIdentifier } from './shortid.ts';
import { asBlockquote, markdownToText, splitBody } from './markdown.ts';
import { embed } from './embeddings.ts';
import { fetchAndExtract } from './extract.ts';
import { generateSummary, judgeEdges, selectEdges, type EdgeCandidate } from './llm.ts';
import { semanticSearch } from './queries.ts';
import { recomputeDerived } from './derive.ts';
import { graphConfig } from './config.ts';
import { randomUUID } from 'node:crypto';
import type { EdgeType, Item, ItemType } from './types.ts';

/**
 * The publish pipeline.
 *
 * One pass: fetch and extract, summarise, embed, find nearest neighbours, judge
 * how the new item relates to them, persist, then recompute derived structure.
 * Every step degrades independently — a failed summariser yields an extractive
 * summary, a failed judge yields term-overlap edges — so a publish is never
 * lost to a transient provider error.
 */

export class PublishError extends Error {}

export interface PublishResult {
  item: Item;
  /** False when an item already existed for this source and was refreshed. */
  created: boolean;
  edgesCreated: number;
  /** True when a model wrote the summary, false when it was extracted. */
  summaryGenerated: boolean;
  /** True when a model judged the edges, false on the overlap fallback. */
  edgesGenerated: boolean;
  /** Paths whose cached renders are now stale. */
  affectedPaths: string[];
}

interface InsertItemInput {
  type: ItemType;
  title: string | null;
  content: string;
  url: string | null;
  tags: string[];
  sourceText: string | null;
  publishedAt?: Date;
}

/**
 * Insert an item, retrying on a short-id collision.
 *
 * The short id is a truncated UUID, so collisions are improbable but not
 * impossible, and a permalink is permanent once published. Rather than
 * detecting the collision and mangling the id, we mint a whole new identifier
 * and try again.
 */
async function insertItem(input: InsertItemInput): Promise<Item> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { id, shortId } = newIdentifier();
    try {
      const rows = await query<{ published_at: unknown }>(
        `INSERT INTO items
           (id, short_id, type, title, content, url, tags, source_text, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()))
         RETURNING published_at`,
        [
          id,
          shortId,
          input.type,
          input.title,
          input.content,
          input.url,
          input.tags,
          input.sourceText,
          input.publishedAt ?? null,
        ],
      );

      return {
        id,
        shortId,
        type: input.type,
        title: input.title,
        content: input.content,
        url: input.url,
        tags: input.tags,
        publishedAt:
          rows[0]?.published_at instanceof Date
            ? rows[0].published_at
            : new Date(String(rows[0]?.published_at)),
        updatedAt: null,
        edgeCount: 0,
      };
    } catch (error) {
      const message = (error as Error).message;
      if (attempt < 4 && /short_id/.test(message) && /unique|duplicate/i.test(message)) {
        continue;
      }
      throw error;
    }
  }
  throw new PublishError('could not allocate a unique short id after 5 attempts');
}

/**
 * Refresh the item already published for a URL, or return null if there is none.
 *
 * Capture is a paste-a-URL flow, so the same URL arrives twice: a retry after a
 * timeout, a second pass over a reading list, a re-run after a prompt change.
 * Inserting again would fork the source into two permalinks splitting one
 * source's edges between them, so a repeat is a refresh of the item that
 * exists.
 *
 * `published_at` and `short_id` are deliberately untouched: a permalink is
 * permanent (R20) and the date the item entered the stream does not change
 * because the pipeline ran again. `updated_at` records that it did.
 *
 * Commentary is preserved unless the caller supplies new commentary. The
 * pipeline owns the blockquote summary and the author owns everything after
 * it, which is the same division the backfill respects.
 */
async function refreshItemByUrl(
  input: InsertItemInput & { url: string },
): Promise<Item | null> {
  const existing = await queryOne<{
    id: string;
    short_id: string;
    content: string;
    edge_count: number;
  }>('SELECT id, short_id, content, edge_count FROM items WHERE url = $1', [input.url]);

  if (!existing) return null;

  const incoming = splitBody(input.content);
  const previous = splitBody(existing.content);
  const commentary = incoming.commentary || previous.commentary;
  const content = [
    incoming.summary ? asBlockquote(incoming.summary) : '',
    commentary,
  ]
    .filter(Boolean)
    .join('\n\n');

  const rows = await query<{ published_at: unknown; updated_at: unknown }>(
    `UPDATE items SET
        type        = $2,
        title       = $3,
        content     = $4,
        tags        = $5,
        source_text = COALESCE($6, source_text),
        updated_at  = now()
      WHERE id = $1
      RETURNING published_at, updated_at`,
    [
      existing.id,
      input.type,
      input.title,
      content,
      input.tags,
      input.sourceText,
    ],
  );

  const row = rows[0];
  return {
    id: existing.id,
    shortId: existing.short_id,
    type: input.type,
    title: input.title,
    content,
    url: input.url,
    tags: input.tags,
    publishedAt: asDate(row?.published_at),
    updatedAt: asDate(row?.updated_at),
    edgeCount: Number(existing.edge_count),
  };
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

/**
 * Insert an item, or refresh the one already published for the same URL.
 *
 * This is what makes the pipeline re-runnable per item rather than merely
 * repeatable: running it twice for one source converges on one item instead of
 * accumulating duplicates.
 */
async function upsertItem(
  input: InsertItemInput,
): Promise<{ item: Item; created: boolean }> {
  if (input.url !== null) {
    const refreshed = await refreshItemByUrl({ ...input, url: input.url });
    if (refreshed) return { item: refreshed, created: false };
  }
  return { item: await insertItem(input), created: true };
}

/**
 * Embed the item, then propose and persist edges to its nearest neighbours.
 * Returns the number of edges actually written.
 *
 * Exported for the backfill, which re-runs exactly this step across the whole
 * corpus after a prompt or model change. Everything it writes is marked
 * `origin = 'generated'`, which is what makes that rebuild safe: the backfill
 * clears the previous pass without touching edges asserted by hand.
 */
export async function connectItem(item: Item): Promise<{
  edgesCreated: number;
  edgesGenerated: boolean;
}> {
  const embeddingText = [item.title, markdownToText(item.content)]
    .filter(Boolean)
    .join('\n');
  const embedding = await embed(embeddingText);

  await query('UPDATE items SET embedding = $2 WHERE id = $1', [
    item.id,
    toVector(embedding),
  ]);

  // No score floor here: the judge decides what is worth an edge, and hiding
  // weak candidates from it would silently narrow what it can consider.
  const neighbours = await semanticSearch(embedding, {
    limit: graphConfig.edgeCandidateCount,
    excludeId: item.id,
  });

  if (neighbours.length === 0) return { edgesCreated: 0, edgesGenerated: false };

  const candidates: EdgeCandidate[] = neighbours.map((neighbour) => ({
    id: neighbour.id,
    shortId: neighbour.shortId,
    title: neighbour.title,
    content: neighbour.content,
    score: neighbour.score,
  }));

  const { proposals, generated } = await judgeEdges(
    { title: item.title, content: item.content },
    candidates,
  );
  const selected = selectEdges(proposals);

  let edgesCreated = 0;
  for (const proposal of selected) {
    const rows = await query<{ id: string }>(
      `INSERT INTO edges (id, from_id, to_id, type, confidence, reason, origin)
       VALUES ($1, $2, $3, $4, $5, $6, 'generated')
       ON CONFLICT (from_id, to_id, type) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        item.id,
        proposal.targetId,
        proposal.type satisfies EdgeType,
        proposal.confidence,
        proposal.reason,
      ],
    );
    if (rows.length > 0) edgesCreated += 1;
  }

  return { edgesCreated, edgesGenerated: generated };
}

/**
 * Paths invalidated by publishing an item.
 *
 * The stream is paginated, so a new item shifts every page; rather than
 * enumerate them we invalidate the layout root, which covers the stream, the
 * item's own permalink, and every derived surface.
 */
function affectedPaths(item: Item): string[] {
  return [
    '/',
    `/i/${item.shortId}`,
    '/themes',
    '/connected',
    '/graph',
    '/feed.json',
    '/feed.xml',
    '/llms.txt',
    '/index.md',
    '/sitemap.xml',
    '/agents',
    '/random',
  ];
}

export interface PublishLinkInput {
  url: string;
  /** Optional author commentary, rendered after the summary. */
  commentary?: string;
  /** Overrides the extracted or generated title. */
  title?: string;
  tags?: string[];
  publishedAt?: Date;
  /** Skip the network fetch by supplying the prose directly. Used by seeds. */
  sourceText?: string;
  sourceTitle?: string;
}

/**
 * Publish a link: the reference site's primary flow, and ours.
 *
 * R1 is enforced here — a link with no usable summary is rejected rather than
 * published as a naked URL.
 */
export async function publishLink(input: PublishLinkInput): Promise<PublishResult> {
  let text = input.sourceText ?? '';
  let sourceTitle = input.sourceTitle ?? null;
  let canonicalUrl = input.url;

  if (input.sourceText === undefined) {
    const extraction = await fetchAndExtract(input.url);
    text = extraction.text;
    sourceTitle = extraction.title;
    canonicalUrl = extraction.url;
  }

  const summary = await generateSummary({
    url: canonicalUrl,
    sourceTitle: sourceTitle ?? undefined,
    text,
  });

  if (summary.summary.trim().length === 0) {
    throw new PublishError(
      'no summary could be produced for this source, and a link cannot be ' +
        'published without commentary; add commentary explicitly to publish it',
    );
  }

  const content = [
    asBlockquote(summary.summary),
    input.commentary?.trim() ? input.commentary.trim() : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { item, created } = await upsertItem({
    type: 'link',
    title: input.title?.trim() || summary.title || sourceTitle,
    content,
    url: canonicalUrl,
    tags: input.tags ?? [],
    sourceText: text ? text.slice(0, 40_000) : null,
    publishedAt: input.publishedAt,
  });

  const { edgesCreated, edgesGenerated } = await connectItem(item);
  await recomputeDerived();

  return {
    item,
    created,
    edgesCreated,
    summaryGenerated: summary.generated,
    edgesGenerated,
    affectedPaths: affectedPaths(item),
  };
}

export interface PublishRiffInput {
  /** The riff itself, in Markdown. */
  body: string;
  title?: string;
  tags?: string[];
  publishedAt?: Date;
}

/**
 * Publish a riff: an original musing with no source URL.
 *
 * The reference site declares this type and never uses it — all 160 of its
 * items are links. Making riffs a real capture path is the one deliberate
 * product difference in this build (R2).
 */
export async function publishRiff(input: PublishRiffInput): Promise<PublishResult> {
  const body = input.body.trim();
  if (body.length === 0) {
    throw new PublishError('a riff needs a body');
  }

  // A riff has no URL to converge on, so every one is a new item.
  const item = await insertItem({
    type: 'riff',
    title: input.title?.trim() || null,
    content: body,
    url: null,
    tags: input.tags ?? [],
    sourceText: null,
    publishedAt: input.publishedAt,
  });

  const { edgesCreated, edgesGenerated } = await connectItem(item);
  await recomputeDerived();

  return {
    item,
    created: true,
    edgesCreated,
    summaryGenerated: false,
    edgesGenerated,
    affectedPaths: affectedPaths(item),
  };
}

export interface PublishEssayInput {
  /** Where the essay lives, typically an offsite blog. */
  url: string;
  title: string;
  /** A pointer needs commentary saying why the essay matters. */
  commentary: string;
  tags?: string[];
  publishedAt?: Date;
}

/** Publish a pointer to a long-form essay hosted elsewhere. */
export async function publishEssay(input: PublishEssayInput): Promise<PublishResult> {
  const commentary = input.commentary.trim();
  if (commentary.length === 0) {
    throw new PublishError('an essay pointer needs commentary');
  }

  const { item, created } = await upsertItem({
    type: 'essay',
    title: input.title.trim(),
    content: commentary,
    url: input.url,
    tags: input.tags ?? [],
    sourceText: null,
    publishedAt: input.publishedAt,
  });

  const { edgesCreated, edgesGenerated } = await connectItem(item);
  await recomputeDerived();

  return {
    item,
    created,
    edgesCreated,
    summaryGenerated: false,
    edgesGenerated,
    affectedPaths: affectedPaths(item),
  };
}
