import type { MetadataRoute } from 'next';
import { absoluteUrl, site } from '@/lib/config';
import {
  countPublishedItems,
  getAllPublishedItems,
  getLatestPublishedAt,
  getThemes,
} from '@/lib/queries';

/**
 * Sitemap, with a real `lastmod` per URL.
 *
 * Built from the current corpus every time, so a stream page that no longer
 * exists cannot linger here — the counterpart to the bounds check on
 * `/page/N` (R8). `/random` is deliberately absent: it redirects, so indexing
 * it would be meaningless.
 */

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [items, themes, totalItems, latest] = await Promise.all([
    getAllPublishedItems(),
    getThemes(),
    countPublishedItems(),
    getLatestPublishedAt(),
  ]);

  const corpusUpdated = latest ?? new Date();
  const totalPages = Math.max(1, Math.ceil(totalItems / site.pageSize));

  const streamPages: MetadataRoute.Sitemap = Array.from(
    { length: totalPages - 1 },
    (_, index) => ({
      url: absoluteUrl(`/page/${index + 2}`),
      lastModified: corpusUpdated,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    }),
  );

  return [
    {
      url: `${site.url}/`,
      lastModified: corpusUpdated,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...streamPages,
    ...items.map((item) => ({
      url: absoluteUrl(`/i/${item.shortId}`),
      lastModified: item.updatedAt ?? item.publishedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl('/themes'),
      lastModified: corpusUpdated,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...themes.map((theme) => ({
      url: absoluteUrl(`/themes/${theme.shortId}`),
      lastModified: theme.spanEnd,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...(
      [
        ['/connected', 0.6],
        ['/graph', 0.6],
        ['/search', 0.5],
        ['/docs', 0.5],
        ['/agents', 0.5],
        ['/about', 0.5],
        ['/contact', 0.3],
        ['/privacy', 0.2],
        ['/colophon', 0.3],
      ] as const
    ).map(([path, priority]) => ({
      url: absoluteUrl(path),
      lastModified: corpusUpdated,
      changeFrequency: 'monthly' as const,
      priority,
    })),
  ];
}
