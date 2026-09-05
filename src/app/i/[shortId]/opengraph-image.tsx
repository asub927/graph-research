import { ImageResponse } from 'next/og';
import { getAllPublishedItems, getItem } from '@/lib/queries';
import { excerpt } from '@/lib/markdown';
import { formatIsoDate } from '@/lib/dates';
import { site } from '@/lib/config';
import { EDGE_META } from '@/lib/types';

/**
 * A social card per item, so a shared permalink previews the item rather than
 * the site.
 *
 * The card states the connection count, because that is the thing this site
 * has that a plain link post does not: the preview says up front that the item
 * sits in a graph.
 */

export const alt = 'Item preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams(): Promise<Array<{ shortId: string }>> {
  const items = await getAllPublishedItems();
  return items.map((item) => ({ shortId: item.shortId }));
}

const RULE_COLOURS = [
  EDGE_META.supports.colour,
  EDGE_META.challenges.colour,
  EDGE_META.develops_into.colour,
  EDGE_META.superseded_by.colour,
  EDGE_META.corrected_by.colour,
  EDGE_META.related_to.colour,
];

export default async function ItemOpenGraphImage({
  params,
}: {
  params: Promise<{ shortId: string }>;
}) {
  const { shortId } = await params;
  const item = await getItem(shortId);

  const title = item?.title ?? site.title;
  // Long titles have to shrink rather than overflow: Satori clips, it does not
  // wrap-and-scroll.
  const titleSize = title.length > 90 ? 46 : title.length > 55 ? 54 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '68px 80px',
          background: '#0f1115',
          color: '#e6e6e6',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, color: '#9099a8' }}>{site.title}</div>
          <div
            style={{
              marginTop: 26,
              fontSize: titleSize,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </div>
          {item ? (
            <div style={{ marginTop: 26, fontSize: 28, lineHeight: 1.45, color: '#9099a8' }}>
              {excerpt(item.content, 170)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 6, width: '100%' }}>
            {RULE_COLOURS.map((colour) => (
              <div key={colour} style={{ flex: 1, background: colour }} />
            ))}
          </div>
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 25,
              color: '#9099a8',
            }}
          >
            <div>
              {item
                ? `${item.type} \u00b7 ${formatIsoDate(item.publishedAt)}`
                : site.author}
            </div>
            <div>
              {item
                ? `${item.edgeCount} connection${item.edgeCount === 1 ? '' : 's'}`
                : site.disclaimer}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
