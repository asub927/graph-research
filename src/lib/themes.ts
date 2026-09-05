import { formatIsoDate } from './dates.ts';
import type { Theme } from './types.ts';

/**
 * Prose for derived themes.
 *
 * A theme has no authored description — it is a hub item plus whatever has
 * connected to it (R5). So everything said about a theme has to be derivable
 * from its shape: how many items, over what period, since when. The reference
 * site advertises "synthesis" on its theme pages but writes no synthesis
 * either; all of its connective prose is edge reason text. We make the same
 * choice, and say so rather than implying an authored summary exists.
 */

/** "6 items spanning 2026-08-02 – 2026-09-04" */
export function themeSpan(theme: Theme): string {
  const start = formatIsoDate(theme.spanStart);
  const end = formatIsoDate(theme.spanEnd);
  const items = `${theme.itemCount} item${theme.itemCount === 1 ? '' : 's'}`;
  return start === end ? `${items} from ${start}` : `${items} spanning ${start} – ${end}`;
}

/** One-line description for the themes index. */
export function themeDescription(theme: Theme): string {
  return `${themeSpan(theme)}. Tracked since ${formatIsoDate(theme.trackedSince)}.`;
}

/**
 * The standing explanation of what a theme page is, shown on every hub.
 *
 * Stated plainly because a reader arriving at a "theme" reasonably expects a
 * curated topic, and this is not that.
 */
export const THEME_EXPLANATION =
  'A theme is not a category I assigned. It is an item that accumulated enough ' +
  'connections to become a hub, shown with everything linked to it. It grows as ' +
  'related items are published, and the connective prose below is the stated ' +
  'reason for each link rather than a summary written after the fact.';
