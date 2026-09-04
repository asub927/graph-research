import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StreamPageView } from '@/components/StreamPageView';
import { site } from '@/lib/config';
import { countPublishedItems } from '@/lib/queries';
import { pageMetadata } from '@/lib/seo';

interface PageProps {
  params: Promise<{ n: string }>;
}

function parsePageNumber(raw: string): number {
  // Reject anything that is not a plain positive integer, so `/page/01` and
  // `/page/2e3` do not become duplicate addresses for the same content.
  if (!/^[1-9][0-9]*$/.test(raw)) notFound();
  return Number.parseInt(raw, 10);
}

/**
 * Pre-render every page that currently exists. Combined with the bounds check
 * in StreamPageView, a page beyond the end 404s instead of rendering empty.
 */
export async function generateStaticParams(): Promise<Array<{ n: string }>> {
  const total = await countPublishedItems();
  const totalPages = Math.max(1, Math.ceil(total / site.pageSize));
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
    n: String(index + 2),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = parsePageNumber((await params).n);
  return pageMetadata({
    title: `Page ${page}`,
    description: `${site.tagline} Page ${page} of the archive.`,
    path: `/page/${page}`,
  });
}

export default async function StreamPage({ params }: PageProps) {
  const page = parsePageNumber((await params).n);
  // Page 1 lives at `/`; serving it here too would duplicate the content at a
  // second address.
  if (page === 1) notFound();
  return <StreamPageView page={page} />;
}
