/**
 * Core domain types, plus the edge-type metadata that drives rendering.
 *
 * The edge metadata table is the single source of truth for: the published
 * OpenAPI enum, the directional labels on item pages, the graph legend colours,
 * and which theme section an edge feeds. Adding a type here wires it through
 * every surface at once — which is precisely what the reference site fails to
 * do, leaving `superseded_by` out of its spec and `corrected_by` defined only
 * in its graph colour map.
 */

export const ITEM_TYPES = ['riff', 'link', 'essay'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const EDGE_TYPES = [
  'supports',
  'challenges',
  'develops_into',
  'related_to',
  'superseded_by',
  'corrected_by',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export type EdgeDirection = 'incoming' | 'outgoing';

/** Which conditional theme section an edge type feeds, if any (R6). */
export type ThemeSection = 'tensions' | 'development' | null;

export interface EdgeTypeMeta {
  /** Heading for an edge pointing away from the item being viewed. */
  outgoingLabel: string;
  /** Heading for an edge pointing at the item being viewed (R4). */
  incomingLabel: string;
  /** Graph legend label and colour. */
  legendLabel: string;
  colour: string;
  /** Theme section this type aggregates into. */
  themeSection: ThemeSection;
  /** Separator used when rendering a pair in a theme section. */
  pairSeparator: string;
  /** Ordering weight for connection groups; lower sorts first. */
  weight: number;
  /** Prose description, published in the OpenAPI spec and the docs page. */
  description: string;
}

export const EDGE_META: Record<EdgeType, EdgeTypeMeta> = {
  supports: {
    outgoingLabel: 'Supports',
    incomingLabel: 'Supported by',
    legendLabel: 'supports',
    colour: '#f06595',
    themeSection: null,
    pairSeparator: '+',
    weight: 1,
    description: 'The source item reinforces or provides evidence for the target.',
  },
  challenges: {
    outgoingLabel: 'Challenges',
    incomingLabel: 'Challenged by',
    legendLabel: 'challenges',
    colour: '#ffd43b',
    themeSection: 'tensions',
    pairSeparator: 'vs',
    weight: 0,
    description: 'The source item complicates, contradicts, or pushes back on the target.',
  },
  develops_into: {
    outgoingLabel: 'Develops into',
    incomingLabel: 'Developed from',
    legendLabel: 'develops into',
    colour: '#69db7c',
    themeSection: 'development',
    pairSeparator: '\u2192',
    weight: 2,
    description: 'The source item is an earlier form of the thinking in the target.',
  },
  related_to: {
    outgoingLabel: 'Related to',
    incomingLabel: 'Related to',
    legendLabel: 'related',
    colour: '#868e96',
    themeSection: null,
    pairSeparator: '\u00b7',
    weight: 5,
    description: 'The items share subject matter without one bearing on the other.',
  },
  superseded_by: {
    outgoingLabel: 'Superseded by',
    incomingLabel: 'Supersedes',
    legendLabel: 'superseded by',
    colour: '#ff8c42',
    themeSection: 'development',
    pairSeparator: '\u21d2',
    weight: 3,
    description: 'The target replaces the source; the earlier position no longer holds.',
  },
  corrected_by: {
    outgoingLabel: 'Corrected by',
    incomingLabel: 'Corrects',
    legendLabel: 'corrected by',
    colour: '#da77f2',
    themeSection: 'tensions',
    pairSeparator: '\u2260',
    weight: 4,
    description: 'The target fixes a factual error in the source.',
  },
};

export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && (EDGE_TYPES as readonly string[]).includes(value);
}

export function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && (ITEM_TYPES as readonly string[]).includes(value);
}

/** Edge types that feed a given theme section, in render order. */
export function edgeTypesForSection(section: Exclude<ThemeSection, null>): EdgeType[] {
  return EDGE_TYPES.filter((type) => EDGE_META[type].themeSection === section).sort(
    (a, b) => EDGE_META[a].weight - EDGE_META[b].weight,
  );
}

export interface Item {
  id: string;
  shortId: string;
  type: ItemType;
  title: string | null;
  /** Markdown. The blockquote summary, plus any author commentary after it. */
  content: string;
  /** Source URL for link items; null for riffs. */
  url: string | null;
  tags: string[];
  publishedAt: Date;
  updatedAt: Date | null;
  /** Total edges incident on this item, in either direction (R7). */
  edgeCount: number;
}

/** An edge as seen from one endpoint, with the other endpoint resolved. */
export interface ResolvedEdge {
  edgeId: string;
  type: EdgeType;
  direction: EdgeDirection;
  confidence: number;
  reason: string;
  otherId: string;
  otherShortId: string;
  otherTitle: string | null;
  otherType: ItemType;
}

/** An ordered pair of items connected by an edge, for theme sections. */
export interface EdgePair {
  edgeId: string;
  type: EdgeType;
  reason: string;
  confidence: number;
  from: { shortId: string; title: string | null };
  to: { shortId: string; title: string | null };
}

export interface Theme {
  /** The hub item's short id, which is also the theme's public id (R5). */
  shortId: string;
  hubItemId: string;
  title: string | null;
  itemCount: number;
  trackedSince: Date;
  spanStart: Date;
  spanEnd: Date;
}

export interface ScoredItem extends Item {
  /** Cosine similarity, 0-1. */
  score: number;
}
