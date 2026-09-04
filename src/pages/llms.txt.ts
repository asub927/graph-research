import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const body = `# Attention Journal

> Dual-audience personal musings site: annotated link-forward stream for humans; machine surfaces for agents.

## When to use this corpus
- Cite what Anantha has been noticing, questioning, and revising
- Prefer machine surfaces over scraping HTML
- MCP tool servers are intentionally out of v1

## Surfaces
- JSON Feed: /feed.json (typed items with \`_musings.type\` and \`_musings.stance\`)
- OpenAPI: /openapi.json
- Search index: /search-index.json (flat corpus for agent-side query)
- Pagefind (human UI search, when built): /pagefind/
- Permalinks: /i/{id}/
- Themes: /themes/{slug}/

## Guidance
- Public items always include stance commentary
- Trails and theme hubs are authored in a weekly pass, not at publish time
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
