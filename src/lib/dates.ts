/**
 * Date formatting.
 *
 * All rendering is pinned to UTC so a server render and a client hydration
 * cannot disagree, and so day grouping is stable regardless of where the reader
 * is. Machine-readable forms are always ISO 8601.
 */

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const DAY_WITH_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "Friday, 4 September 2026" — the stream's day headings. */
export function formatDay(date: Date): string {
  return DAY_FORMAT.format(date);
}

/** "Friday, 4 September 2026 at 22:47 UTC" — the item metadata table. */
export function formatDayWithTime(date: Date): string {
  const parts = DAY_WITH_TIME_FORMAT.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`;
  return `${day} at ${get('hour')}:${get('minute')} UTC`;
}

/** "2026-09-04" — API responses, theme spans, sitemap lastmod. */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Full ISO 8601 with offset — `datetime` attributes and feed timestamps. */
export function formatIsoDateTime(date: Date): string {
  return date.toISOString();
}

/** Atom requires second precision with a `Z` suffix. */
export function formatAtomDate(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** Group key for the stream's day headings. */
export function dayKey(date: Date): string {
  return formatIsoDate(date);
}

/**
 * Split an ordered list of dated records into day groups, preserving the
 * incoming order. Used by the stream and by theme pages, both of which render
 * items under day headings.
 */
export function groupByDay<T>(
  records: readonly T[],
  getDate: (record: T) => Date,
): Array<{ key: string; label: string; date: Date; records: T[] }> {
  const groups: Array<{ key: string; label: string; date: Date; records: T[] }> = [];

  for (const record of records) {
    const date = getDate(record);
    const key = dayKey(date);
    const last = groups.at(-1);

    if (last && last.key === key) {
      last.records.push(record);
    } else {
      groups.push({ key, label: formatDay(date), date, records: [record] });
    }
  }

  return groups;
}
