-- Date each theme from its hub item rather than from its promotion.
--
-- `tracked_since` used to default to now(), so it recorded when the pipeline
-- first noticed a hub had enough connections. That is a fact about the
-- pipeline, not about the reading: in a freshly imported corpus every theme
-- claimed to have been tracked since today, a date after the newest item in
-- its own span. The hub's publication date is when the line of thought
-- actually started, and it does not move when a hub is demoted and promoted
-- again. Existing values carry no information worth keeping, so they are all
-- replaced.

UPDATE themes
   SET tracked_since = items.published_at
  FROM items
 WHERE items.id = themes.hub_item_id;
