import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  API_BASE,
  API_ENDPOINTS,
  API_ERRORS,
  buildOpenApiDocument,
} from '../src/lib/openapi.ts';
import { EDGE_TYPES, ITEM_TYPES } from '../src/lib/types.ts';
import { negotiate, parseAccept, qualityFor } from '../src/lib/negotiate.ts';
import { REPRESENTATIONS, representationList } from '../src/lib/representations.ts';
import {
  edgeListSchema,
  itemEdgesSchema,
  keywordSearchSchema,
  problemSchema,
  semanticSearchSchema,
} from '../src/lib/api-schema.ts';

/**
 * The published contract, tested against the code that implements it.
 *
 * The failure this guards against is the reference site's: an `Edge` enum in
 * the spec that omits a type the data contains, and a sixth type defined only
 * in a colour map. Drift like that is invisible until an agent trusts the spec.
 */

const document = buildOpenApiDocument();
const schemas = (
  document.components as { schemas: Record<string, Record<string, unknown>> }
).schemas;
const paths = document.paths as Record<string, unknown>;

describe('OpenAPI document', () => {
  it('publishes exactly the edge types the code renders', () => {
    assert.deepEqual(schemas.EdgeType?.enum, [...EDGE_TYPES]);
  });

  it('publishes exactly the item types the code emits', () => {
    assert.deepEqual(schemas.ItemType?.enum, [...ITEM_TYPES]);
  });

  it('describes every endpoint the site serves', () => {
    for (const endpoint of API_ENDPOINTS) {
      assert.ok(
        paths[`${API_BASE}${endpoint.path}`],
        `${endpoint.path} is missing from the spec`,
      );
    }
    assert.equal(Object.keys(paths).length, API_ENDPOINTS.length);
  });

  it('resolves every $ref against a declared component', () => {
    const refs = new Set(
      [...JSON.stringify(document).matchAll(/"#\/components\/schemas\/([^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    );
    for (const ref of refs) {
      assert.ok(schemas[ref], `dangling $ref to ${ref}`);
    }
  });

  it('documents a 429 on every endpoint, since every one is rate limited', () => {
    for (const endpoint of API_ENDPOINTS) {
      const operation = (paths[`${API_BASE}${endpoint.path}`] as { get: { responses: object } })
        .get;
      assert.ok(
        '429' in operation.responses,
        `${endpoint.path} does not document its rate limit`,
      );
    }
  });

  it('gives every parameter a description', () => {
    for (const endpoint of API_ENDPOINTS) {
      for (const parameter of endpoint.parameters) {
        assert.ok(parameter.description.length > 0, `${parameter.name} is undocumented`);
      }
    }
  });
});

describe('problem types', () => {
  /**
   * Every `type` slug a handler emits resolves to `/docs#error-<slug>`. If a
   * handler introduces a slug with no catalogue entry, the link 404s inside the
   * page and the caller lands nowhere useful.
   */
  it('has a documented entry for every slug the handlers emit', async () => {
    const documented = new Set([...API_ERRORS.map((error) => error.slug), 'general']);
    const emitted = new Set<string>();

    async function walk(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/^\s*type: '([a-z][a-z0-9-]*)',$/gm)) {
          emitted.add(match[1]!);
        }
      }
    }

    await walk(join(process.cwd(), 'src', 'app', 'api'));

    assert.ok(emitted.size > 0, 'found no problem slugs to check');
    for (const slug of emitted) {
      assert.ok(documented.has(slug), `problem type "${slug}" is not documented in /docs`);
    }
  });

  it('accepts the extension members RFC 9457 allows', () => {
    const parsed = problemSchema.parse({
      type: 'https://example.fyi/docs#error-invalid-edge-type',
      title: 'Unknown edge type',
      status: 400,
      available_types: [...EDGE_TYPES],
    });
    assert.deepEqual(parsed.available_types, [...EDGE_TYPES]);
  });
});

describe('response schemas', () => {
  const item = {
    id: '00000000-0000-4000-8000-000000000000',
    short_id: 'abcd1234',
    type: 'link' as const,
    title: 'A title',
    content: '> A summary.',
    excerpt: 'A summary.',
    url: 'https://example.com/a',
    tags: [],
    published_at: '2026-09-04T00:00:00.000Z',
    updated_at: null,
    connections: 2,
    permalink: 'https://example.fyi/i/abcd1234',
  };

  it('accepts a keyword search response', () => {
    assert.doesNotThrow(() =>
      keywordSearchSchema.parse({ query: 'graph', count: 1, items: [item] }),
    );
  });

  it('requires semantic responses to disclose which vectoriser ranked them', () => {
    assert.throws(() =>
      semanticSearchSchema.parse({ query: 'graph', count: 1, items: [{ ...item, score: 0.9 }] }),
    );
    assert.doesNotThrow(() =>
      semanticSearchSchema.parse({
        query: 'graph',
        count: 1,
        items: [{ ...item, score: 0.9 }],
        embeddings: 'local-term-overlap',
      }),
    );
  });

  it('rejects an edge type the site does not publish', () => {
    assert.throws(() =>
      edgeListSchema.parse({ type: 'inspired_by', count: 0, edges: [] }),
    );
  });

  it('accepts an empty connection list', () => {
    assert.doesNotThrow(() =>
      itemEdgesSchema.parse({
        item: { short_id: 'abcd1234', title: null, permalink: 'https://example.fyi/i/abcd1234' },
        count: 0,
        connections: [],
      }),
    );
  });
});

describe('content negotiation', () => {
  it('orders media ranges by quality', () => {
    const ranges = parseAccept('text/plain;q=0.5, text/html, text/markdown;q=0.9');
    assert.deepEqual(
      ranges.map((range) => range.type),
      ['text/html', 'text/markdown', 'text/plain'],
    );
  });

  it('matches a media type through its group wildcard', () => {
    const ranges = parseAccept('text/*;q=0.4, */*;q=0.1');
    assert.equal(qualityFor(ranges, 'text/html'), 0.4);
    assert.equal(qualityFor(ranges, 'application/json'), 0.1);
  });

  it('serves HTML to a browser', () => {
    assert.equal(
      negotiate('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
      'html',
    );
  });

  it('serves HTML to a wildcard client and to a client with no preference', () => {
    assert.equal(negotiate('*/*'), 'html');
    assert.equal(negotiate(null), 'html');
    assert.equal(negotiate(''), 'html');
  });

  it('serves Markdown only when it is named', () => {
    assert.equal(negotiate('text/markdown'), 'markdown');
    assert.equal(negotiate('text/markdown, text/html;q=0.5'), 'markdown');
    // Named but explicitly less wanted than HTML.
    assert.equal(negotiate('text/html, text/markdown;q=0.5'), 'html');
    // A group wildcard covers Markdown, but naming it is what decides.
    assert.equal(negotiate('text/*'), 'html');
  });

  it('refuses a request that accepts nothing it can serve', () => {
    assert.equal(negotiate('application/pdf'), 'unacceptable');
    assert.equal(negotiate('image/png, image/webp'), 'unacceptable');
    // q=0 is a refusal, not a preference.
    assert.equal(negotiate('text/html;q=0, application/pdf'), 'unacceptable');
  });
});

describe('representation list', () => {
  it('names every representation the 406 promises', () => {
    const body = representationList('https://example.fyi');
    for (const entry of REPRESENTATIONS) {
      assert.ok(
        body.includes(entry.mediaType),
        `${entry.mediaType} is missing from the 406 body`,
      );
      assert.ok(body.includes(`https://example.fyi${entry.path}`));
    }
  });
});
