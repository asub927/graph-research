import { formatIsoDate, groupByDay } from '@/lib/dates';
import { StreamItem } from './StreamItem';
import type { Item } from '@/lib/types';

/**
 * A list of items grouped under day headings, shared by the stream and by
 * theme pages so both read identically.
 */

export function DayGroupedStream({ items }: { items: readonly Item[] }) {
  const groups = groupByDay(items, (item) => item.publishedAt);

  if (groups.length === 0) {
    return <p className="empty-state">Nothing published yet.</p>;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`}>
          <h2 className="day-heading" id={`day-${group.key}`}>
            <time dateTime={formatIsoDate(group.date)}>{group.label}</time>
          </h2>
          <div className="stream">
            {group.records.map((item) => (
              <StreamItem key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
