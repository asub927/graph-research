import type { Metadata } from 'next';
import Link from 'next/link';
import { getThemes } from '@/lib/queries';
import { pageMetadata } from '@/lib/seo';
import { themeDescription } from '@/lib/themes';

export const metadata: Metadata = pageMetadata({
  title: 'Themes',
  description:
    'Ideas this site keeps returning to. Themes are derived from connection ' +
    'density rather than assigned as categories.',
  path: '/themes',
});

export default async function ThemesPage() {
  const themes = await getThemes();

  return (
    <div>
      <h1 className="page-title">Themes</h1>
      <p className="page-intro">
        Each theme is an item that accumulated enough connections to become a
        hub, plus everything linked to it. Nothing here was assigned by hand
        &mdash; the clusters come out of the graph, and they shift as it grows.
      </p>

      {themes.length === 0 ? (
        <p className="empty-state">
          No themes yet. They appear once items have accumulated enough
          connections between them, so this fills in as the corpus grows.
        </p>
      ) : (
        <ol className="ranked-list">
          {themes.map((theme) => (
            <li key={theme.shortId}>
              {/* R7: the same badge used in the stream and on /connected. */}
              <span className="ranked-count">
                <span className="edge-badge">{theme.itemCount}</span>
              </span>
              <span className="ranked-body">
                <Link className="ranked-title" href={`/themes/${theme.shortId}`}>
                  {theme.title ?? `Theme ${theme.shortId}`}
                </Link>
                <span className="ranked-detail">{themeDescription(theme)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
