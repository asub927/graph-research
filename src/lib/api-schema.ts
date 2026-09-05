import { z } from 'zod';
import { absoluteUrl } from './config.ts';
import { excerpt } from './markdown.ts';
import {
  EDGE_TYPES,
  ITEM_TYPES,
  type EdgePair,
  type Item,
  type ResolvedEdge,
  type ScoredItem,
} from './types.ts';

/**
 * The wire contract for the query API.
 *
 * These schemas are the single source of truth: the handlers serialise through
 * them, and `/openapi.json` is generated from them. That is a direct response
 * to the reference site, whose published `Edge` enum omits a type its own data
 * contains and whose graph page defines a sixth type documented nowhere. Here
 * the enums come from `EDGE_TYPES` and `ITEM_TYPES`, so the spec cannot drift
 * from what the code emits — and a test asserts exactly that.
 */

export const itemTypeSchema = z.enum(ITEM_TYPES).describe('Kind of item.');

export const edgeTypeSchema = z
  .enum(EDGE_TYPES)
  .describe('How the source item bears on the target item.');

export const itemSchema = z
  .object({
    id: z.string().uuid().describe('Stable UUID.'),
    short_id: z
      .string()
      .describe('Eight-character public identifier used in every URL.'),
    type: itemTypeSchema,
    title: z.string().nullable(),
    /** Markdown: the blockquote summary, then any author commentary. */
    content: z.string().describe('Markdown body: summary, then commentary.'),
    excerpt: z.string().describe('Plain-text summary, suitable for display.'),
    url: z.string().nullable().describe('Source URL. Null for riffs.'),
    tags: z.array(z.string()),
    published_at: z.string().datetime(),
    updated_at: z.string().datetime().nullable(),
    connections: z.number().int().describe('Edges incident on this item.'),
    permalink: z.string().url(),
  })
  .describe('A single published item.');

export const scoredItemSchema = itemSchema
  .extend({
    score: z.number().min(0).max(1).describe('Cosine similarity, 1 is identical.'),
  })
  .describe('An item with a relevance score.');

export const edgeSchema = z
  .object({
    id: z.string().uuid(),
    type: edgeTypeSchema,
    confidence: z.number().min(0).max(1).describe('How sure the relationship is.'),
    reason: z
      .string()
      .describe('Why the two items are connected. Published verbatim to readers.'),
    from: z.object({
      short_id: z.string(),
      title: z.string().nullable(),
      permalink: z.string().url(),
    }),
    to: z.object({
      short_id: z.string(),
      title: z.string().nullable(),
      permalink: z.string().url(),
    }),
  })
  .describe('A directional, typed connection between two items.');

export const itemConnectionSchema = z
  .object({
    id: z.string().uuid(),
    type: edgeTypeSchema,
    direction: z
      .enum(['incoming', 'outgoing'])
      .describe('Relative to the item that was requested.'),
    label: z
      .string()
      .describe('Human-readable heading, inverted for incoming edges.'),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    other: z.object({
      short_id: z.string(),
      title: z.string().nullable(),
      type: itemTypeSchema,
      permalink: z.string().url(),
    }),
  })
  .describe('A connection as seen from one endpoint.');

export const keywordSearchSchema = z.object({
  query: z.string(),
  count: z.number().int(),
  items: z.array(itemSchema),
});

export const semanticSearchSchema = z.object({
  query: z.string(),
  count: z.number().int(),
  items: z.array(scoredItemSchema),
  embeddings: z
    .enum(['model', 'local-term-overlap'])
    .describe(
      'Which vectoriser produced the ranking. `local-term-overlap` means no ' +
        'embedding provider is configured, so results rank by shared terms ' +
        'rather than by meaning.',
    ),
});

export const pagedItemListSchema = z.object({
  count: z.number().int().describe('Items in this response.'),
  total: z.number().int().describe('Items matching the filter.'),
  limit: z.number().int(),
  offset: z.number().int(),
  has_more: z.boolean(),
  items: z.array(itemSchema),
});

export const edgeListSchema = z.object({
  type: edgeTypeSchema,
  count: z.number().int(),
  edges: z.array(edgeSchema),
});

export const itemEdgesSchema = z.object({
  item: z.object({
    short_id: z.string(),
    title: z.string().nullable(),
    permalink: z.string().url(),
  }),
  count: z.number().int(),
  connections: z.array(itemConnectionSchema),
});

export const graphSummarySchema = z.object({
  total_items: z.number().int(),
  total_edges: z.number().int(),
  edge_types: z.record(z.number().int()).describe('Edge count by type.'),
  top_connected: z.array(
    z.object({
      short_id: z.string(),
      title: z.string().nullable(),
      permalink: z.string().url(),
      connections: z.number().int(),
    }),
  ),
  recent_items: z.array(
    z.object({
      short_id: z.string(),
      title: z.string().nullable(),
      type: itemTypeSchema,
      permalink: z.string().url(),
      published_at: z.string(),
    }),
  ),
  tensions: z.array(edgeSchema).describe('Where items in the corpus disagree.'),
  generated_at: z.string().datetime(),
  note: z.string().describe('Staleness guidance for cached copies.'),
});

export const problemSchema = z
  .object({
    type: z.string().url().describe('Link to the documentation for this error.'),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
  })
  // Some problems carry extra members — an invalid `type` reports the valid
  // ones — which RFC 9457 explicitly allows.
  .passthrough()
  .describe('RFC 9457 problem detail.');

export type ApiItem = z.infer<typeof itemSchema>;
export type ApiEdge = z.infer<typeof edgeSchema>;
export type ApiItemConnection = z.infer<typeof itemConnectionSchema>;

// --- Serialisers ------------------------------------------------------------

export function serializeItem(item: Item): ApiItem {
  return {
    id: item.id,
    short_id: item.shortId,
    type: item.type,
    title: item.title,
    content: item.content,
    excerpt: excerpt(item.content, 280),
    url: item.url,
    tags: item.tags,
    published_at: item.publishedAt.toISOString(),
    updated_at: item.updatedAt ? item.updatedAt.toISOString() : null,
    connections: item.edgeCount,
    permalink: absoluteUrl(`/i/${item.shortId}`),
  };
}

export function serializeScoredItem(item: ScoredItem): z.infer<typeof scoredItemSchema> {
  return { ...serializeItem(item), score: Number(item.score.toFixed(4)) };
}

export function serializeEdgePair(pair: EdgePair): ApiEdge {
  return {
    id: pair.edgeId,
    type: pair.type,
    confidence: pair.confidence,
    reason: pair.reason,
    from: {
      short_id: pair.from.shortId,
      title: pair.from.title,
      permalink: absoluteUrl(`/i/${pair.from.shortId}`),
    },
    to: {
      short_id: pair.to.shortId,
      title: pair.to.title,
      permalink: absoluteUrl(`/i/${pair.to.shortId}`),
    },
  };
}

export function serializeConnection(
  edge: ResolvedEdge,
  label: string,
): ApiItemConnection {
  return {
    id: edge.edgeId,
    type: edge.type,
    direction: edge.direction,
    label,
    confidence: edge.confidence,
    reason: edge.reason,
    other: {
      short_id: edge.otherShortId,
      title: edge.otherTitle,
      type: edge.otherType,
      permalink: absoluteUrl(`/i/${edge.otherShortId}`),
    },
  };
}
