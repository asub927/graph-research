-- Record where each edge came from.
--
-- The backfill re-runs the judging pass over the whole corpus after a prompt or
-- model change, which means deleting what the previous pass produced. Without
-- this column that deletion would also take out edges a human asserted by hand,
-- and there would be no way to tell the two apart afterwards. Existing rows are
-- backfilled as 'generated', which is what they are: everything written before
-- this migration came out of the pipeline.

ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'generated'
    CHECK (origin IN ('generated', 'asserted'));

CREATE INDEX IF NOT EXISTS edges_origin_idx ON edges (origin);
