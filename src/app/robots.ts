import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/config';

/**
 * `robots.txt`, segmented by what a crawler is for (R12).
 *
 * The distinction drawn here is not "AI or not". It is whether a crawl results
 * in someone reading this, with attribution and a link back. Answer engines and
 * user-triggered fetches do; a corpus scrape for pretraining does not. Both are
 * named explicitly, because a silent default reads as an accident rather than a
 * position.
 *
 * `/admin` and `/random` are excluded from everything: one is authenticated,
 * the other is a redirect with no content of its own.
 */

/** Crawlers that surface this site to a reader, with a link. */
const ANSWER_ENGINES = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

/** Bulk collectors that feed training corpora without surfacing the source. */
const TRAINING_ONLY = ['CCBot', 'ByteSpider', 'Bytespider', 'Omgilibot', 'Omgili'];

const PRIVATE_PATHS = ['/admin', '/random'];

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: ANSWER_ENGINES, allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: TRAINING_ONLY, disallow: '/' },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
