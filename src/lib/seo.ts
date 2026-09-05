import type { Metadata } from 'next';
import { absoluteUrl, site } from './config.ts';
import { excerpt } from './markdown.ts';
import { formatIsoDate } from './dates.ts';
import type { Item, Theme } from './types.ts';

/**
 * Metadata and structured data.
 *
 * The reference site emits one byte-identical JSON-LD `@graph` on every page
 * and gives item and theme pages no structured data of their own. Here the
 * layout emits the site-level graph once and each resource type layers its own
 * entity on top (R18), so an item is discoverable as an `Article` and a theme
 * as a `CollectionPage`. The page-level nodes reference the site entities by
 * `@id` rather than repeating them.
 */

const PERSON_ID = `${site.url}/#person`;
const ORGANIZATION_ID = `${site.url}/#organization`;
const WEBSITE_ID = `${site.url}/#website`;

interface JsonLdNode {
  '@type': string;
  '@id'?: string;
  [key: string]: unknown;
}

/** Entities that describe the site itself, present on every page. */
export function siteGraph(): JsonLdNode[] {
  return [
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: site.author,
      jobTitle: site.authorRole,
      url: `${site.url}/`,
      ...(site.essaysUrl ? { sameAs: [site.essaysUrl] } : {}),
    },
    {
      // The site as a publishing entity, distinct from the person who writes
      // it. Keeping them separate is what lets `author` and `publisher` differ
      // on an Article without either claim being a fiction.
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: site.title,
      url: `${site.url}/`,
      description: site.tagline,
      founder: { '@id': PERSON_ID },
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: site.title,
      url: `${site.url}/`,
      description: site.tagline,
      inLanguage: 'en',
      author: { '@id': PERSON_ID },
      publisher: { '@id': ORGANIZATION_ID },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${site.url}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${site.url}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: `What is ${site.title}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              `${site.title} is a continuously updated list of links and riffs ` +
              `from ${site.author}. Links always carry commentary, and items are ` +
              'connected by typed relationships that say how one bears on another.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is there an API, and does it need a key?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'Yes, and no. The query API under /api/fyi/q/ is public, ' +
              'read-only, and unauthenticated. The schema is at /openapi.json.',
          },
        },
        {
          '@type': 'Question',
          name: 'How should an agent use this site?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'Start at /llms.txt for when this corpus is and is not useful. ' +
              'Fetch /feed.json for the whole corpus, or query /api/fyi/q/ for ' +
              'search and connections. Every page also serves Markdown when ' +
              'requested with Accept: text/markdown.',
          },
        },
      ],
    },
  ];
}

/** `Article` for a single item, layered on the site graph. */
export function itemGraph(item: Item): JsonLdNode[] {
  const url = absoluteUrl(`/i/${item.shortId}`);
  return [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: item.title ?? `Item ${item.shortId}`,
      url,
      datePublished: item.publishedAt.toISOString(),
      ...(item.updatedAt ? { dateModified: item.updatedAt.toISOString() } : {}),
      description: excerpt(item.content, 300),
      author: { '@id': PERSON_ID },
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': WEBSITE_ID },
      inLanguage: 'en',
      ...(item.tags.length > 0 ? { keywords: item.tags.join(', ') } : {}),
      // For a link item the article being described lives elsewhere; record it
      // rather than implying we published the source.
      ...(item.url ? { citation: item.url, isBasedOn: item.url } : {}),
    },
  ];
}

/** `CollectionPage` for a theme hub, layered on the site graph. */
export function themeGraph(theme: Theme, items: readonly Item[]): JsonLdNode[] {
  const url = absoluteUrl(`/themes/${theme.shortId}`);
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      name: theme.title ?? `Theme ${theme.shortId}`,
      url,
      description:
        `${theme.itemCount} connected items on "${theme.title ?? theme.shortId}", ` +
        `spanning ${formatIsoDate(theme.spanStart)} to ${formatIsoDate(theme.spanEnd)}.`,
      isPartOf: { '@id': WEBSITE_ID },
      inLanguage: 'en',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.slice(0, 50).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(`/i/${item.shortId}`),
          name: item.title ?? `Item ${item.shortId}`,
        })),
      },
    },
  ];
}

export function jsonLdScript(graph: JsonLdNode[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    // `</script>` inside JSON would end the script element early.
    .replace(/</g, '\\u003c');
}

interface PageMetaOptions {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  publishedTime?: Date;
  modifiedTime?: Date;
  /** Set when the page should not be indexed (e.g. the random redirect). */
  noIndex?: boolean;
}

/**
 * Build page metadata. Titles are `Page — Site` except the home page, which is
 * the site name alone.
 */
export function pageMetadata(options: PageMetaOptions): Metadata {
  const canonical = absoluteUrl(options.path);
  return {
    title: options.title,
    description: options.description,
    alternates: { canonical },
    ...(options.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: options.type ?? 'website',
      title: options.title,
      description: options.description,
      url: canonical,
      siteName: site.title,
      locale: 'en',
      ...(options.publishedTime
        ? { publishedTime: options.publishedTime.toISOString() }
        : {}),
      ...(options.modifiedTime
        ? { modifiedTime: options.modifiedTime.toISOString() }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: options.title,
      description: options.description,
    },
  };
}
