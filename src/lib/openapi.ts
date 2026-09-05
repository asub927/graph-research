import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { site, absoluteUrl } from './config.ts';
import { RATE_LIMIT } from './rate-limit.ts';
import {
  edgeListSchema,
  edgeSchema,
  edgeTypeSchema,
  graphSummarySchema,
  itemConnectionSchema,
  itemEdgesSchema,
  itemSchema,
  itemTypeSchema,
  keywordSearchSchema,
  pagedItemListSchema,
  problemSchema,
  scoredItemSchema,
  semanticSearchSchema,
} from './api-schema.ts';
import { EDGE_META, EDGE_TYPES, ITEM_TYPES } from './types.ts';

/**
 * The API catalogue, and the OpenAPI document generated from it.
 *
 * One list drives three surfaces: the spec at `/openapi.json`, the reference at
 * `/docs`, and the endpoint list in `/llms.txt`. The response schemas are the
 * same Zod objects the handlers serialise through, so the published enum cannot
 * drift from the emitted data — the specific failure the reference site has,
 * where `superseded_by` appears in its edges but not in its spec.
 */

export interface ApiParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  schema: Record<string, unknown>;
  example?: string;
}

export interface ApiEndpoint {
  /** Path relative to the API base, with `{}` placeholders. */
  path: string;
  operationId: string;
  summary: string;
  description: string;
  parameters: ApiParameter[];
  responseSchema: ZodTypeAny;
  responseName: string;
  /** Path used in the worked `curl` example on `/docs`. */
  examplePath: string;
  /** Error statuses this endpoint can return beyond 429. */
  errorStatuses: number[];
}

export const API_BASE = '/api/fyi/q';

const string = (extra: Record<string, unknown> = {}) => ({ type: 'string', ...extra });
const integer = (extra: Record<string, unknown> = {}) => ({ type: 'integer', ...extra });

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    path: '/search/{keyword}',
    operationId: 'searchByKeyword',
    summary: 'Full-text search',
    description:
      'Ranked keyword search across titles, summaries, and commentary. ' +
      'Matches whole words after English stemming, so "connects" finds ' +
      '"connection". Use semantic search when the wording may differ from ' +
      'the corpus.',
    parameters: [
      {
        name: 'keyword',
        in: 'path',
        required: true,
        description: 'Search terms, URL-encoded. Up to 200 characters.',
        schema: string({ maxLength: 200 }),
        example: 'knowledge graph',
      },
    ],
    responseSchema: keywordSearchSchema,
    responseName: 'KeywordSearchResult',
    examplePath: '/search/knowledge%20graph',
    errorStatuses: [400, 414],
  },
  {
    path: '/semantic/{query}',
    operationId: 'searchBySemantics',
    summary: 'Semantic search',
    description:
      'Nearest-neighbour search over item embeddings, scored by cosine ' +
      'similarity. Finds items about a subject even when they do not use the ' +
      'words in the query. The `embeddings` field says which vectoriser ' +
      'produced the ranking; treat `local-term-overlap` results as keyword ' +
      'matching rather than meaning.',
    parameters: [
      {
        name: 'query',
        in: 'path',
        required: true,
        description: 'Natural-language query, URL-encoded. Up to 500 characters.',
        schema: string({ maxLength: 500 }),
        example: 'how do agents read this site',
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Results to return, 1-50.',
        schema: integer({ minimum: 1, maximum: 50, default: 10 }),
      },
    ],
    responseSchema: semanticSearchSchema,
    responseName: 'SemanticSearchResult',
    examplePath: '/semantic/how%20agents%20read%20this%20site?limit=5',
    errorStatuses: [400, 414],
  },
  {
    path: '/items',
    operationId: 'listItems',
    summary: 'List items',
    description:
      'Published items, newest first, with optional date and type filters. ' +
      'Page with `limit` and `offset`; `has_more` tells you when to stop. To ' +
      'mirror the whole corpus in one request, use /feed.json instead.',
    parameters: [
      {
        name: 'since',
        in: 'query',
        required: false,
        description: 'Only items published on or after this ISO date.',
        schema: string({ format: 'date' }),
      },
      {
        name: 'type',
        in: 'query',
        required: false,
        description: 'Restrict to one item type.',
        schema: { type: 'string', enum: [...ITEM_TYPES] },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Items per page, 1-200.',
        schema: integer({ minimum: 1, maximum: 200, default: 50 }),
      },
      {
        name: 'offset',
        in: 'query',
        required: false,
        description: 'Items to skip.',
        schema: integer({ minimum: 0, default: 0 }),
      },
    ],
    responseSchema: pagedItemListSchema,
    responseName: 'PagedItems',
    examplePath: '/items?type=link&limit=5',
    errorStatuses: [400],
  },
  {
    path: '/edges/{itemId}',
    operationId: 'getItemConnections',
    summary: 'Connections for one item',
    description:
      'Every edge incident on an item, in either direction, as the item ' +
      'page renders them. `label` is already inverted for incoming edges, so ' +
      'an edge of type `supports` pointing at this item reads "Supported by". ' +
      'Accepts a short id or a full UUID.',
    parameters: [
      {
        name: 'itemId',
        in: 'path',
        required: true,
        description: 'Item short id or UUID.',
        schema: string(),
        example: 'a1b2c3d4',
      },
    ],
    responseSchema: itemEdgesSchema,
    responseName: 'ItemConnections',
    examplePath: '/edges/{shortId}',
    errorStatuses: [400, 404],
  },
  {
    path: '/edges',
    operationId: 'listEdgesByType',
    summary: 'Edges of one type',
    description:
      'All edges of a single type across the corpus, highest confidence ' +
      'first. `type` is required: the unfiltered set is dominated by generic ' +
      'relatedness and is rarely what you want.',
    parameters: [
      {
        name: 'type',
        in: 'query',
        required: true,
        description: 'Edge type to return.',
        schema: { type: 'string', enum: [...EDGE_TYPES] },
        example: 'challenges',
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Edges to return, 1-500.',
        schema: integer({ minimum: 1, maximum: 500, default: 200 }),
      },
    ],
    responseSchema: edgeListSchema,
    responseName: 'EdgeList',
    examplePath: '/edges?type=challenges',
    errorStatuses: [400],
  },
  {
    path: '/summary',
    operationId: 'getSummary',
    summary: 'Corpus summary',
    description:
      'Size, edge-type histogram, most-connected items, most recent items, ' +
      'and the current tensions. One call to orient yourself before querying ' +
      'anything specific. `generated_at` and `note` describe how stale a ' +
      'cached copy is allowed to get.',
    parameters: [],
    responseSchema: graphSummarySchema,
    responseName: 'CorpusSummary',
    examplePath: '/summary',
    errorStatuses: [],
  },
];

/**
 * Every problem `type` the site can emit.
 *
 * The `type` member of a problem document resolves to `/docs#error-<slug>`, so
 * each slug here has to have an anchor on the docs page. A caller that hits an
 * error and follows the link should land on the explanation, not on the top of
 * a page. The reference site's problem types are opaque strings that resolve
 * nowhere.
 */
export const API_ERRORS: Array<{
  slug: string;
  status: number;
  title: string;
  detail: string;
}> = [
  {
    slug: 'missing-keyword',
    status: 400,
    title: 'Missing keyword',
    detail: 'The search path had no keyword segment. Append one, URL-encoded.',
  },
  {
    slug: 'keyword-too-long',
    status: 414,
    title: 'Keyword too long',
    detail: 'Keywords are capped at 200 characters. Shorten it or use semantic search.',
  },
  {
    slug: 'missing-query',
    status: 400,
    title: 'Missing query',
    detail: 'The semantic path had no query segment.',
  },
  {
    slug: 'query-too-long',
    status: 414,
    title: 'Query too long',
    detail: 'Semantic queries are capped at 500 characters.',
  },
  {
    slug: 'invalid-since',
    status: 400,
    title: 'Invalid since',
    detail: '`since` must be an ISO calendar date, for example `2026-08-01`.',
  },
  {
    slug: 'invalid-type',
    status: 400,
    title: 'Invalid item type',
    detail: `\`type\` must be one of ${ITEM_TYPES.join(', ')}.`,
  },
  {
    slug: 'missing-edge-type',
    status: 400,
    title: 'Missing edge type',
    detail:
      '`/edges` requires `?type=`. The valid values are listed in the ' +
      '`available_types` member of the problem document.',
  },
  {
    slug: 'invalid-edge-type',
    status: 400,
    title: 'Unknown edge type',
    detail: `\`type\` must be one of ${EDGE_TYPES.join(', ')}.`,
  },
  {
    slug: 'missing-item-id',
    status: 400,
    title: 'Missing item identifier',
    detail: '`/edges/{itemId}` needs a short id or UUID as its last segment.',
  },
  {
    slug: 'item-not-found',
    status: 404,
    title: 'Item not found',
    detail:
      'No published item has that identifier. Drafts and deleted items are ' +
      'not addressable; permalinks of published items never change.',
  },
  {
    slug: 'rate-limited',
    status: 429,
    title: 'Too many requests',
    detail:
      'The per-instance courtesy limit was exceeded. `retry-after` gives the ' +
      'seconds to wait; `ratelimit-remaining` on every response lets you avoid ' +
      'reaching it at all.',
  },
  {
    slug: 'unauthorized',
    status: 401,
    title: 'Unauthorized',
    detail:
      'Only the capture endpoint requires authentication, as ' +
      '`Authorization: Bearer <token>`. Nothing under the query API does.',
  },
  {
    slug: 'ingest-unconfigured',
    status: 503,
    title: 'Ingest is not configured',
    detail:
      'The deployment has no ingest token set, so publishing is disabled. ' +
      'This never affects reads.',
  },
  {
    slug: 'malformed-body',
    status: 400,
    title: 'Malformed request body',
    detail: 'A capture request body must be JSON.',
  },
  {
    slug: 'validation',
    status: 422,
    title: 'Invalid capture request',
    detail:
      'The capture body matched no supported shape. The `errors` member lists ' +
      'the failing fields.',
  },
  {
    slug: 'extraction-failed',
    status: 422,
    title: 'Could not read the source',
    detail:
      'The URL could not be fetched or held no readable article text. Private ' +
      'and loopback addresses are refused outright.',
  },
  {
    slug: 'publish-failed',
    status: 422,
    title: 'Could not publish',
    detail: 'The pipeline rejected the item; the detail says why.',
  },
  {
    slug: 'internal',
    status: 500,
    title: 'Publish failed',
    detail: 'Something unexpected broke. Nothing was published.',
  },
];

/**
 * Named schemas emitted into `components.schemas` and referenced by `$ref`.
 *
 * `dependsOn` names the components each one may point at. It exists because
 * the generator resolves a repeated schema to wherever it first saw it: without
 * the restriction, generating the standalone `EdgeType` component while `Edge`
 * is also in scope makes `EdgeType` a pointer into `Edge/properties/type`,
 * which points back at `EdgeType`. Listing only what a component sits above
 * keeps the reference graph acyclic.
 */
const COMPONENTS: Array<{
  name: string;
  schema: ZodTypeAny;
  dependsOn: readonly string[];
}> = [
  { name: 'ItemType', schema: itemTypeSchema, dependsOn: [] },
  { name: 'EdgeType', schema: edgeTypeSchema, dependsOn: [] },
  { name: 'Problem', schema: problemSchema, dependsOn: [] },
  { name: 'Item', schema: itemSchema, dependsOn: ['ItemType'] },
  { name: 'ScoredItem', schema: scoredItemSchema, dependsOn: ['ItemType'] },
  { name: 'Edge', schema: edgeSchema, dependsOn: ['EdgeType'] },
  { name: 'Connection', schema: itemConnectionSchema, dependsOn: ['EdgeType', 'ItemType'] },
];

const COMPONENT_SCHEMAS: Record<string, ZodTypeAny> = Object.fromEntries(
  COMPONENTS.map((component) => [component.name, component.schema]),
);

const ERROR_TITLES: Record<number, string> = {
  400: 'The request was malformed — a missing or invalid parameter.',
  404: 'No published resource matches the identifier.',
  414: 'The path segment exceeded the documented length limit.',
  429: 'Rate limit exceeded. Retry after the number of seconds in `retry-after`.',
};

/**
 * Convert one Zod schema to JSON Schema, replacing any nested schema that has
 * its own component name with a `$ref`.
 *
 * `visible` limits which components may be referenced. Endpoint responses see
 * all of them; a component sees only the ones it sits above.
 */
function jsonSchemaFor(
  schema: ZodTypeAny,
  visible: readonly string[] = Object.keys(COMPONENT_SCHEMAS),
): Record<string, unknown> {
  const definitions = Object.fromEntries(
    visible.map((name) => [name, COMPONENT_SCHEMAS[name]!]),
  );

  const generated = zodToJsonSchema(schema, {
    definitions,
    definitionPath: 'components/schemas',
    target: 'jsonSchema7',
    $refStrategy: 'root',
  }) as Record<string, unknown>;

  // The generator returns the shared definitions alongside the root schema
  // under the definition path. We assemble `components.schemas` ourselves, so
  // the copy is dropped along with the draft-07 marker OpenAPI does not want.
  delete generated['components/schemas'];
  delete generated.$schema;
  return generated;
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const endpoint of API_ENDPOINTS) {
    const responses: Record<string, unknown> = {
      '200': {
        description: 'Success.',
        content: {
          'application/json': { schema: jsonSchemaFor(endpoint.responseSchema) },
        },
      },
    };

    for (const status of [...endpoint.errorStatuses, 429]) {
      responses[String(status)] = {
        description: ERROR_TITLES[status] ?? 'Error.',
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/Problem' },
          },
        },
      };
    }

    paths[`${API_BASE}${endpoint.path}`] = {
      get: {
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        parameters: endpoint.parameters.map((parameter) => ({
          name: parameter.name,
          in: parameter.in,
          required: parameter.required,
          description: parameter.description,
          schema: parameter.schema,
          ...(parameter.example ? { example: parameter.example } : {}),
        })),
        responses,
      },
    };
  }

  const components = Object.fromEntries(
    COMPONENTS.map((component) => [
      component.name,
      jsonSchemaFor(component.schema, component.dependsOn),
    ]),
  );

  return {
    openapi: '3.1.0',
    info: {
      title: `${site.title} query API`,
      version: '1.0.0',
      summary: 'Read-only access to the item stream and its typed edge graph.',
      description: [
        `Public, read-only, and unauthenticated. Every endpoint returns JSON;`,
        `errors are RFC 9457 problem documents with a \`type\` that resolves to`,
        `${absoluteUrl('/docs')}.`,
        '',
        `Identifiers appear as path segments rather than query parameters,`,
        `because some agent fetch tools strip query strings that look like ids.`,
        '',
        `Rate limiting is best-effort and enforced per server instance:`,
        `${RATE_LIMIT.limit} requests per ${RATE_LIMIT.windowSeconds} seconds.`,
        `Because the counter is not shared between instances, the effective`,
        `ceiling may be higher. Responses carry \`ratelimit-*\` headers; pace`,
        `yourself against those rather than against this number.`,
      ].join('\n'),
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    },
    servers: [{ url: site.url, description: site.title }],
    paths,
    components: { schemas: components },
    tags: [
      {
        name: 'edges',
        description: Object.entries(EDGE_META)
          .map(([type, meta]) => `${type}: ${meta.description}`)
          .join(' '),
      },
    ],
  };
}
