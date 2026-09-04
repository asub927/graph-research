/**
 * Site-wide configuration, resolved once from the environment.
 *
 * Everything here is safe to import from both server components and scripts.
 * Nothing secret is exported: `ingestToken` and the LLM credentials are read
 * through separate accessors that only ever run server-side.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

const siteUrl = env('SITE_URL', 'http://localhost:3000').replace(/\/$/, '');

export const site = {
  url: siteUrl,
  title: env('SITE_TITLE', 'example.fyi'),
  author: env('SITE_AUTHOR', 'The Author'),
  authorRole: env('SITE_AUTHOR_ROLE', 'Software engineer'),
  tagline: env(
    'SITE_TAGLINE',
    "What I'm reading, noticing, questioning, concluding, and revising.",
  ),
  essaysUrl: env('SITE_ESSAYS_URL', ''),
  contactEmail: env('SITE_CONTACT_EMAIL', ''),
  /** Items per stream page. Matches the reference site. */
  pageSize: 25,
  /** Standing disclaimer, shown site-wide (R1). */
  disclaimer: 'Links indicate relevance, not agreement.',
} as const;

export const graphConfig = {
  /** Connections an item needs before it is promoted to a theme hub (R5). */
  themeHubThreshold: intEnv('THEME_HUB_THRESHOLD', 3),
  /** Nearest neighbours considered as edge candidates per publish. */
  edgeCandidateCount: intEnv('EDGE_CANDIDATE_COUNT', 15),
  /** Edges below this confidence are discarded rather than published. */
  edgeConfidenceFloor: floatEnv('EDGE_CONFIDENCE_FLOOR', 0.55),
  /** Hard cap on edges kept per publish, highest confidence first. */
  edgeMaxPerItem: intEnv('EDGE_MAX_PER_ITEM', 8),
  /**
   * Edges rendered on the graph page. The reference inlines its whole payload
   * and silently drops roughly two-thirds of its edges to stay small; we make
   * the budget explicit and fetch the payload instead of inlining it.
   */
  graphEdgeBudget: intEnv('GRAPH_EDGE_BUDGET', 600),
} as const;

export const embeddingConfig = {
  model: env('EMBEDDING_MODEL', 'text-embedding-3-small'),
  dimensions: intEnv('EMBEDDING_DIMENSIONS', 1536),
} as const;

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Permalink path for an item. Stable forever (R20). */
export function permalinkPath(shortId: string): string {
  return `/i/${shortId}`;
}

/** Theme path. The theme's public id is its hub item's short id (R5). */
export function themePath(shortId: string): string {
  return `/themes/${shortId}`;
}
