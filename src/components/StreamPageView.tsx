import { notFound } from 'next/navigation';
import { absoluteUrl } from '@/lib/config';
import { getStreamPage } from '@/lib/queries';
import { DayGroupedStream } from './DayGroupedStream';
import { Pagination, streamPagePath } from './Pagination';

/**
 * The stream, shared by `/` and `/page/N`.
 *
 * A page number beyond the last page is a 404 rather than an empty page. That
 * is the prune requirement in R8: the reference site regenerates its pages
 * without deleting the ones that fall away, and still serves an orphaned
 * `/page/8/` with markup from an older build. Deriving existence from the
 * current item count means a page cannot outlive its contents.
 */

export async function StreamPageView({ page }: { page: number }) {
  const { items, totalPages, totalItems } = await getStreamPage(page);

  if (page > totalPages && totalItems > 0) notFound();

  return (
    <>
      {page > 1 ? (
        <link rel="prev" href={absoluteUrl(streamPagePath(page - 1))} />
      ) : null}
      {page < totalPages ? (
        <link rel="next" href={absoluteUrl(streamPagePath(page + 1))} />
      ) : null}

      <h1 className="visually-hidden">
        {page === 1 ? 'Latest' : `Latest, page ${page}`}
      </h1>

      <DayGroupedStream items={items} />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
