import { ImageResponse } from 'next/og';
import { site } from '@/lib/config';

/**
 * The social card.
 *
 * The reference site points `og:image` at a 24×24 favicon, so every share of it
 * renders a blank preview. This is a real 1200×630 card, drawn from the same
 * site configuration as the header rather than being a separate asset that can
 * fall out of date with it.
 */

export const alt = `${site.title} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0f1115',
          color: '#e6e6e6',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, color: '#9099a8', letterSpacing: '-0.01em' }}>
            {site.title}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 62,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
            }}
          >
            {site.tagline}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* The edge palette, as a rule across the foot of the card: the six
              connection types in the order they render on an item page. */}
          <div style={{ display: 'flex', height: 6, width: '100%' }}>
            {['#f472b6', '#fbbf24', '#4ade80', '#fb923c', '#d8b4fe', '#9099a8'].map(
              (colour) => (
                <div key={colour} style={{ flex: 1, background: colour }} />
              ),
            )}
          </div>
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 26,
              color: '#9099a8',
            }}
          >
            {/* Satori needs an explicit display on any element with more than
                one child, so these stay single interpolated strings. */}
            <div>{`${site.author} \u00b7 ${site.authorRole}`}</div>
            <div>{site.disclaimer}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
