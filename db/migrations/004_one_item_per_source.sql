-- One item per source URL.
--
-- Capture is a paste-a-URL flow, so the same URL gets pasted twice: a retry
-- after a timeout, a second pass over a reading list, a re-run of the pipeline
-- after a prompt change. Without this the corpus quietly accumulates two items
-- for one source, each with its own permalink and its own half of the edges,
-- and the graph treats them as unrelated documents.
--
-- Partial, because riffs have no URL and every one of them would otherwise
-- collide on NULL under a plain unique index.

CREATE UNIQUE INDEX IF NOT EXISTS items_url_key ON items (url) WHERE url IS NOT NULL;
