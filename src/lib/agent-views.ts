import { absoluteUrl, site } from './config.ts';
import { excerpt } from './markdown.ts';
import { formatIsoDate } from './dates.ts';
import { API_BASE, API_ENDPOINTS } from './openapi.ts';
import { themeSpan } from './themes.ts';
import { EDGE_META, EDGE_TYPES } from './types.ts';
import {
  countEdges,
  countPublishedItems,
  getEdgeTypeHistogram,
  getRecentItems,
  getThemes,
} from './queries.ts';
import type { Item, Theme } from './types.ts';

/**
 * The three plain-text views an agent reads: `/llms.txt`, the copyable context
 * block on `/agents`, and the Markdown representation served at `/index.md`
 * and by content negotiation.
 *
 * All three are generated from live data on every publish rather than
 * hand-maintained, and all three state when they were generated and what to
 * refetch when that gets old. A context block pasted into a system prompt
 * outlives the moment it was copied; saying so is the difference between a
 * useful summary and a confidently stale one.
 */

const RECENT_COUNT = 10;

export interface AgentSnapshot {
  generatedAt: Date;
  itemCount: number;
  edgeCount: number;
  edgeTypes: Record<string, number>;
  themes: Theme[];
  recent: Item[];
}

export async function loadAgentSnapshot(): Promise<AgentSnapshot> {
  const [itemCount, edgeCount, edgeTypes, themes, recent] = await Promise.all([
    countPublishedItems(),
    countEdges(),
    getEdgeTypeHistogram(),
    getThemes(),
    getRecentItems(RECENT_COUNT),
  ]);

  return { generatedAt: new Date(), itemCount, edgeCount, edgeTypes, themes, recent };
}

function itemLine(item: Item): string {
  const title = item.title ?? `Untitled ${item.type}`;
  const source = item.url ? ` (source: ${item.url})` : '';
  return (
    `- [${title}](${absoluteUrl(`/i/${item.shortId}`)}) — ` +
    `${formatIsoDate(item.publishedAt)}, ${item.type}, ` +
    `${item.edgeCount} connection${item.edgeCount === 1 ? '' : 's'}${source}\n` +
    `  ${excerpt(item.content, 200)}`
  );
}

function themeLine(theme: Theme): string {
  return (
    `- [${theme.title ?? theme.shortId}](${absoluteUrl(`/themes/${theme.shortId}`)}) — ` +
    `${themeSpan(theme)}`
  );
}

/** The staleness warning every generated view carries. */
function freshnessNote(generatedAt: Date): string {
  return (
    `Generated ${generatedAt.toISOString()}. This file is rewritten on every ` +
    'publish. If that timestamp is more than a few weeks old you are reading a ' +
    `cached copy — fetch ${absoluteUrl('/feed.json')} for the current corpus, ` +
    `or ${absoluteUrl(`${API_BASE}/summary`)} for its current shape.`
  );
}

// --- /llms.txt --------------------------------------------------------------

export function buildLlmsTxt(snapshot: AgentSnapshot): string {
  const { itemCount, edgeCount, themes, recent } = snapshot;

  const edgeVocabulary = EDGE_TYPES.map(
    (type) => `- \`${type}\` — ${EDGE_META[type].description}`,
  ).join('\n');

  const endpoints = API_ENDPOINTS.map(
    (endpoint) => `- \`GET ${API_BASE}${endpoint.path}\` — ${endpoint.summary}. ${endpoint.description}`,
  ).join('\n');

  const sections: string[] = [
    `# ${site.title}`,
    '',
    `> ${site.tagline} Written by ${site.author}, ${site.authorRole}. ` +
      `${site.disclaimer}`,
    '',
    freshnessNote(snapshot.generatedAt),
    '',
    '## What this is',
    '',
    `${itemCount} items — links with mandatory commentary, plus riffs and ` +
      `essays — joined by ${edgeCount} typed, directional edges. Each edge ` +
      'carries a confidence score and a written reason for the connection. ' +
      'Themes are not a tag taxonomy: an item that accumulates enough ' +
      'connections becomes a hub, and the hub plus its neighbours is a theme.',
    '',
    '## When this is useful',
    '',
    "- You want one person's stated position on something, with the reasoning attached.",
    '- You want to see where sources on a subject disagree — query the `challenges` edges.',
    '- You want to trace how a position changed over time — follow `develops_into` and `superseded_by`.',
    '- You want a curated reading list on a subject, with the reason each item was kept.',
    '',
    '## When this is not useful',
    '',
    '- You need consensus, authority, or comprehensive coverage. This is one reader, and links indicate relevance rather than agreement.',
    '- You need the source material itself. Items summarise and comment on sources; follow the `url` field to read them.',
    '- You need anything published after the timestamp above.',
    '',
    '## How connections are typed',
    '',
    edgeVocabulary,
    '',
    'Edges are stored once and directional. A connection reads in the ' +
      'opposite voice from the other end: an item that `supports` another is, ' +
      'from the target\u2019s side, "supported by" the first.',
    '',
    '## Machine-readable entry points',
    '',
    `- [${absoluteUrl('/feed.json')}](${absoluteUrl('/feed.json')}) — JSON Feed 1.1. Every item, with a \`_fyi\` extension carrying type, tags, short id, and connection count. Start here to mirror the corpus.`,
    `- [${absoluteUrl('/feed.xml')}](${absoluteUrl('/feed.xml')}) — Atom, with full rendered content per entry.`,
    `- [${absoluteUrl('/index.md')}](${absoluteUrl('/index.md')}) — this site as Markdown. Any page also serves Markdown for \`Accept: text/markdown\`.`,
    `- [${absoluteUrl('/openapi.json')}](${absoluteUrl('/openapi.json')}) — OpenAPI 3.1 for the query API.`,
    `- [${absoluteUrl('/docs')}](${absoluteUrl('/docs')}) — the same API described in prose, with a worked example per endpoint.`,
    `- [${absoluteUrl('/sitemap.xml')}](${absoluteUrl('/sitemap.xml')}) — every page, with last-modified dates.`,
    `- [${absoluteUrl('/agents')}](${absoluteUrl('/agents')}) — a copyable context block for a system prompt.`,
    '',
    '## Query API',
    '',
    'Public, read-only, no key. Errors are RFC 9457 problem documents. ' +
      'Identifiers are path segments rather than query parameters, because ' +
      'some fetch tools strip query strings that look like ids.',
    '',
    endpoints,
    '',
    '## Themes',
    '',
    themes.length > 0
      ? themes.map(themeLine).join('\n')
      : '_No themes yet. Themes appear once items accumulate enough connections._',
    '',
    `## ${recent.length} most recent items`,
    '',
    recent.length > 0
      ? recent.map(itemLine).join('\n')
      : '_Nothing published yet._',
    '',
    '## Attribution',
    '',
    `Quote or cite freely with a link to the item permalink. Content by ` +
      `${site.author}${site.contactEmail ? ` (${site.contactEmail})` : ''}.`,
    '',
  ];

  return `${sections.join('\n')}`;
}

// --- The copyable context block on /agents ----------------------------------

/**
 * A compact brief, sized to be pasted into a system prompt.
 *
 * Shorter than `llms.txt` on purpose: it leaves out the API reference and the
 * per-item excerpts, and instead tells the agent where to fetch those. What it
 * keeps is what a model cannot re-derive — what the corpus is, what the edge
 * vocabulary means, and how to tell when this text has gone stale.
 */
export function buildAgentContext(snapshot: AgentSnapshot): string {
  const { itemCount, edgeCount, edgeTypes, themes, recent } = snapshot;

  const histogram = EDGE_TYPES.filter((type) => (edgeTypes[type] ?? 0) > 0)
    .map((type) => `${type} ${edgeTypes[type]}`)
    .join(', ');

  const lines = [
    `${site.title} — ${site.tagline}`,
    `By ${site.author}, ${site.authorRole}. ${site.disclaimer}`,
    '',
    `Snapshot taken ${snapshot.generatedAt.toISOString()}.`,
    `${itemCount} items, ${edgeCount} connections${histogram ? ` (${histogram})` : ''}.`,
    '',
    'WHAT IT IS',
    'A continuously updated stream of links, riffs, and essays. Every link ' +
      'carries commentary. Items are joined by typed, directional edges, each ' +
      'with a confidence score and a written reason. Themes are derived: an ' +
      'item that accumulates connections becomes a hub, and the hub plus its ' +
      'neighbours forms a theme.',
    '',
    'EDGE VOCABULARY',
    ...EDGE_TYPES.map((type) => `${type}: ${EDGE_META[type].description}`),
    '',
    'HOW TO USE IT',
    `Whole corpus: ${absoluteUrl('/feed.json')}`,
    `Corpus shape: ${absoluteUrl(`${API_BASE}/summary`)}`,
    `Search: ${absoluteUrl(`${API_BASE}/search/{keyword}`)} or ${absoluteUrl(`${API_BASE}/semantic/{query}`)}`,
    `Connections for an item: ${absoluteUrl(`${API_BASE}/edges/{shortId}`)}`,
    `Disagreements in the corpus: ${absoluteUrl(`${API_BASE}/edges?type=challenges`)}`,
    `Full reference: ${absoluteUrl('/openapi.json')}`,
    '',
    'LIMITS',
    'One person\u2019s reading, not a survey. A link means the item was worth ' +
      'reading, not that it is endorsed. Summaries are model-written from the ' +
      'source; the source itself is linked from each item.',
    '',
    'FRESHNESS',
    `This block was generated ${snapshot.generatedAt.toISOString()} and is ` +
      'rewritten on every publish. If that is more than a few weeks in the ' +
      `past, refetch ${absoluteUrl('/agents')} or read ${absoluteUrl('/feed.json')} ` +
      'instead of relying on the item list below.',
  ];

  if (themes.length > 0) {
    lines.push(
      '',
      'CURRENT THEMES',
      ...themes
        .slice(0, 10)
        .map(
          (theme) =>
            `${theme.title ?? theme.shortId} (${theme.itemCount} items) — ` +
            absoluteUrl(`/themes/${theme.shortId}`),
        ),
    );
  }

  if (recent.length > 0) {
    lines.push(
      '',
      `MOST RECENT ${recent.length}`,
      ...recent.map(
        (item) =>
          `${formatIsoDate(item.publishedAt)} — ${item.title ?? `Untitled ${item.type}`} — ` +
          absoluteUrl(`/i/${item.shortId}`),
      ),
    );
  }

  return lines.join('\n');
}

// --- /index.md --------------------------------------------------------------

/**
 * The Markdown representation of the site, served at `/index.md` and returned
 * for `Accept: text/markdown` on any page.
 *
 * It is the site rather than the requested page because that is what the
 * reference does, and because it is the more useful answer: an agent that asked
 * for Markdown wants the corpus, not a Markdown rendering of one page's
 * navigation furniture.
 */
export function buildIndexMarkdown(
  snapshot: AgentSnapshot,
  items: readonly Item[],
): string {
  const sections = [
    `# ${site.title}`,
    '',
    `${site.tagline}`,
    '',
    `By ${site.author}, ${site.authorRole}. ${site.disclaimer}`,
    '',
    freshnessNote(snapshot.generatedAt),
    '',
    `${snapshot.itemCount} items, ${snapshot.edgeCount} typed connections, ` +
      `${snapshot.themes.length} derived themes.`,
    '',
    '## Other representations',
    '',
    `- Full corpus as JSON Feed: ${absoluteUrl('/feed.json')}`,
    `- Agent guidance: ${absoluteUrl('/llms.txt')}`,
    `- Query API: ${absoluteUrl('/docs')} (schema at ${absoluteUrl('/openapi.json')})`,
    '',
  ];

  if (snapshot.themes.length > 0) {
    sections.push('## Themes', '', snapshot.themes.map(themeLine).join('\n'), '');
  }

  sections.push(
    `## Items`,
    '',
    items.length > 0
      ? items.map(itemLine).join('\n')
      : '_Nothing published yet._',
    '',
  );

  return sections.join('\n');
}
