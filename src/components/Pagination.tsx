import Link from 'next/link';

/**
 * Stream pagination (R8).
 *
 * Classic numbered paging rather than infinite scroll, so every item sits at a
 * crawlable, linkable address. `rel=prev`/`rel=next` chaining lives in each
 * page's metadata; this renders the visible controls.
 */

export function streamPagePath(page: number): string {
  return page <= 1 ? '/' : `/page/${page}`;
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Stream pages">
      {page < totalPages ? (
        <Link href={streamPagePath(page + 1)} rel="next">
          older &rarr;
        </Link>
      ) : (
        <span />
      )}
      <span className="pagination-status">
        page {page} of {totalPages}
      </span>
      {page > 1 ? (
        <Link href={streamPagePath(page - 1)} rel="prev">
          &larr; newer
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
