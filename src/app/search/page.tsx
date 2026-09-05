import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchView } from '@/components/SearchView';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/config';

/**
 * The search page shell.
 *
 * Static: the query lives in `?q=`, which the client component reads through
 * `useSearchParams`. Reading it here instead would make the page dynamic and
 * cost every visitor a server render to produce the same empty form.
 *
 * The `<noscript>` block matters because this is one of the few pages that does
 * not work without JavaScript, and a reader who has it off deserves to be told
 * where else to look rather than left with a dead input.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Search',
  description: `Semantic search across everything on ${site.title}.`,
  path: '/search',
});

export default function SearchPage() {
  return (
    <>
      <h1 className="page-title">Search</h1>
      <p className="page-intro">
        Searches by meaning rather than by keyword, so you can describe what you
        are after instead of guessing the wording. Results are scored by
        similarity; anything above roughly 0.4 is usually worth opening.
      </p>

      <noscript>
        <p className="callout">
          Search needs JavaScript, which is off. Everything it queries is
          reachable without it: browse <a href="/">the stream</a>, the{' '}
          <a href="/themes">themes</a>, or the{' '}
          <a href="/connected">most-connected items</a>. Or query the API
          directly &mdash; <code>/api/fyi/q/search/&#123;keyword&#125;</code> is
          documented at <a href="/docs">/docs</a>.
        </p>
      </noscript>

      {/* useSearchParams suspends during prerender; the fallback is what gets
          baked into the static HTML. */}
      <Suspense fallback={<p className="search-status">Loading search&hellip;</p>}>
        <SearchView />
      </Suspense>
    </>
  );
}
