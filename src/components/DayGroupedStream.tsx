import { formatIsoDate, groupByDay } from '@/lib/dates';
import { StreamItem, type HeadingLevel } from './StreamItem';
import type { Item } from '@/lib/types';

/**
 * A list of items grouped under day headings, shared by the stream and by
 * theme pages so both read identically.
 *
 * Heading level is a parameter because the two hosts nest it differently: on
 * the stream the day is the top-level structure, while on a theme page it sits
 * under an "Items" heading. Fixing the level would break the document outline
 * in one place or the other (R17).
 */

interface DayGroupedStreamProps {
  items: readonly Item[];
  dayHeadingLevel?: HeadingLevel;
}

export function DayGroupedStream({
  items,
  dayHeadingLevel = 2,
}: DayGroupedStreamProps) {
  const groups = groupByDay(items, (item) => item.publishedAt);
  const DayHeading = `h${dayHeadingLevel}` as const;
  const itemHeadingLevel = Math.min(dayHeadingLevel + 1, 4) as HeadingLevel;

  if (groups.length === 0) {
    return <p className="empty-state">Nothing published yet.</p>;
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`day-${group.key}`}>
          <DayHeading className="day-heading" id={`day-${group.key}`}>
            <time dateTime={formatIsoDate(group.date)}>{group.label}</time>
          </DayHeading>
          <div className="stream">
            {group.records.map((item) => (
              <StreamItem key={item.id} item={item} headingLevel={itemHeadingLevel} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
