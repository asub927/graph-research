-- Core schema: items, the typed edge graph, and derived theme hubs.
--
-- `{{EMBEDDING_DIMENSIONS}}` is substituted by scripts/migrate.ts from the
-- EMBEDDING_DIMENSIONS environment variable so the vector width matches the
-- configured embedding model.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS items (
  id            uuid PRIMARY KEY,
  -- The 8-character public identifier used in every URL. Derived from `id` but
  -- stored explicitly and constrained unique, because a truncated uuid can
  -- collide and the permalink must be stable forever once published.
  short_id      text NOT NULL UNIQUE CHECK (short_id ~ '^[0-9a-f]{8}$'),
  type          text NOT NULL CHECK (type IN ('riff', 'link', 'essay')),
  title         text,
  -- Markdown: the blockquote summary, followed by author commentary if any.
  content       text NOT NULL,
  -- Source URL. Required for links, absent for riffs; enforced below.
  url           text,
  tags          text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'published'
                  CHECK (status IN ('draft', 'published')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Extracted source prose, retained so backfills can re-summarise and
  -- re-judge edges without refetching every URL.
  source_text   text,
  embedding     vector({{EMBEDDING_DIMENSIONS}}),
  -- Denormalised count of incident edges in either direction, recomputed by
  -- the derive step. Read on every stream render, so it is cached rather than
  -- joined.
  edge_count    integer NOT NULL DEFAULT 0,
  CONSTRAINT items_link_needs_url CHECK (type <> 'link' OR url IS NOT NULL),
  -- R1: commentary is mandatory, so an item can never be published empty.
  CONSTRAINT items_content_not_blank CHECK (length(btrim(content)) > 0)
);

-- Full-text search backing /api/fyi/q/search/{keyword}. The expression is
-- immutable because the regconfig is named explicitly, which is what lets this
-- be a stored generated column.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS items_search_idx ON items USING gin (search_vector);
CREATE INDEX IF NOT EXISTS items_published_idx
  ON items (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS items_type_idx ON items (type);
CREATE INDEX IF NOT EXISTS items_edge_count_idx ON items (edge_count DESC);

CREATE TABLE IF NOT EXISTS edges (
  id          uuid PRIMARY KEY,
  from_id     uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  to_id       uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (
                type IN ('supports', 'challenges', 'develops_into',
                         'related_to', 'superseded_by', 'corrected_by')
              ),
  confidence  numeric(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  -- The natural-language justification. Rendered verbatim on item and theme
  -- pages, so it is required: an edge with no stated reason is not publishable.
  reason      text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edges_no_self_reference CHECK (from_id <> to_id),
  CONSTRAINT edges_unique_typed_pair UNIQUE (from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS edges_from_idx ON edges (from_id);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges (to_id);
CREATE INDEX IF NOT EXISTS edges_type_idx ON edges (type);

-- A theme is a hub item that accumulated enough connections to be worth its own
-- page. Its public id is the hub item's short_id, so there is no separate theme
-- identifier to keep in sync. Counts and span are cached by the derive step.
CREATE TABLE IF NOT EXISTS themes (
  hub_item_id    uuid PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
  tracked_since  timestamptz NOT NULL DEFAULT now(),
  item_count     integer NOT NULL DEFAULT 0,
  span_start     timestamptz,
  span_end       timestamptz
);

CREATE INDEX IF NOT EXISTS themes_item_count_idx ON themes (item_count DESC);
