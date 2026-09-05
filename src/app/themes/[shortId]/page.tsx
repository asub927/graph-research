import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EdgePairList } from '@/components/Connections';
import { DayGroupedStream } from '@/components/DayGroupedStream';
import { formatIsoDate } from '@/lib/dates';
import { getTheme, getThemeEdgePairs, getThemeItems, getThemes } from '@/lib/queries';
import { jsonLdScript, pageMetadata, themeGraph } from '@/lib/seo';
import { isShortId } from '@/lib/shortid';
import { THEME_EXPLANATION, themeSpan } from '@/lib/themes';
import { edgeTypesForSection } from '@/lib/types';

interface PageProps {
  params: Promise<{ shortId: string }>;
}

export async function generateStaticParams(): Promise<Array<{ shortId: string }>> {
  const themes = await getThemes();
  return themes.map((theme) => ({ shortId: theme.shortId }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shortId } = await params;
  const theme = isShortId(shortId) ? await getTheme(shortId) : null;
  if (!theme) return { title: 'Not found' };

  return pageMetadata({
    title: theme.title ?? `Theme ${theme.shortId}`,
    description: `${themeSpan(theme)}, connected around "${theme.title ?? theme.shortId}".`,
    path: `/themes/${theme.shortId}`,
  });
}

export default async function ThemePage({ params }: PageProps) {
  const { shortId } = await params;
  if (!isShortId(shortId)) notFound();

  const theme = await getTheme(shortId);
  if (!theme) notFound();

  // Tensions and development lines are drawn only from edges whose endpoints
  // are both inside this cluster, which is what makes the sections conditional
  // rather than decorative (R6).
  const [items, tensions, development] = await Promise.all([
    getThemeItems(theme.hubItemId),
    getThemeEdgePairs(theme.hubItemId, edgeTypesForSection('tensions')),
    getThemeEdgePairs(theme.hubItemId, edgeTypesForSection('development')),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(themeGraph(theme, items)) }}
      />

      <div>
        {/* R17: one h1, naming the theme. The reference emits two here. */}
        <h1 className="page-title">{theme.title ?? `Theme ${theme.shortId}`}</h1>
        <p className="page-intro">
          {themeSpan(theme)}. Tracked since{' '}
          <time dateTime={formatIsoDate(theme.trackedSince)}>
            {formatIsoDate(theme.trackedSince)}
          </time>
          . The hub is{' '}
          <Link href={`/i/${theme.shortId}`}>this item</Link>; everything below
          connects to it.
        </p>

        <div className="callout">{THEME_EXPLANATION}</div>

        {tensions.length > 0 ? (
          <section aria-labelledby="tensions-heading">
            <h2 className="connections-heading" id="tensions-heading">
              Tensions
            </h2>
            <p className="connections-note">
              Where items in this cluster pull against each other.
            </p>
            <EdgePairList pairs={tensions} headingId="tensions-heading" />
          </section>
        ) : null}

        {development.length > 0 ? (
          <section aria-labelledby="development-heading">
            <h2 className="connections-heading" id="development-heading">
              Lines of development
            </h2>
            <p className="connections-note">
              Where one item carries an earlier thought forward.
            </p>
            <EdgePairList pairs={development} headingId="development-heading" />
          </section>
        ) : null}

        <section aria-labelledby="items-heading">
          <h2 className="connections-heading" id="items-heading">
            Items
          </h2>
          {/* Unpaginated: a theme is a bounded cluster, not a stream. Day
              headings sit a level deeper here than on the stream, because they
              are nested under this section's own heading. */}
          <DayGroupedStream items={items} dayHeadingLevel={3} />
        </section>

        <p className="page-intro" style={{ marginTop: '2rem' }}>
          <Link href={`/graph?focus=${theme.shortId}`}>
            See this hub in the graph &rarr;
          </Link>
        </p>
      </div>
    </>
  );
}
