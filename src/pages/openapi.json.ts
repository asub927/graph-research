import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site }) => {
  const home = (site?.origin ?? 'https://example.com').replace(/\/$/, '');
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Attention Journal Agent API',
      version: '1.0.0',
      description:
        'Static, build-time machine surfaces for the Attention Journal. No live query backend and no MCP in v1.',
    },
    servers: [{ url: home }],
    security: [],
    paths: {
      '/feed.json': {
        get: {
          summary: 'JSON Feed of public items',
          security: [],
          responses: {
            '200': {
              description: 'JSON Feed 1.1 with `_musings` extension fields',
            },
          },
        },
      },
      '/search-index.json': {
        get: {
          summary: 'Flat search index for agent-side querying',
          security: [],
          responses: {
            '200': {
              description: 'Array of public items with id, title, type, stance, permalink, tags',
            },
          },
        },
      },
      '/llms.txt': {
        get: {
          summary: 'Corpus usage guidance for agents',
          security: [],
          responses: { '200': { description: 'Plain-text guidance' } },
        },
      },
      '/i/{id}': {
        get: {
          summary: 'HTML permalink for a public item',
          security: [],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Item HTML page' } },
        },
      },
      '/themes/{slug}': {
        get: {
          summary: 'HTML theme hub',
          security: [],
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Theme HTML page' } },
        },
      },
      '/pagefind': {
        get: {
          summary: 'Pagefind static search assets (optional human UI search)',
          security: [],
          responses: { '200': { description: 'Static Pagefind index directory when built' } },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
