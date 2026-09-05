import { absoluteUrl } from './config.ts';

/**
 * The list of ways this site can be read.
 *
 * Lives on its own, with no database or Node dependencies, because three very
 * different places need it: the middleware's 406 (which runs before any page
 * code), the Markdown 404, and the prose pages. Anything that imported the
 * query layer could not run in the first of those.
 */

export interface Representation {
  mediaType: string;
  path: string;
  note: string;
}

export const REPRESENTATIONS: readonly Representation[] = [
  { mediaType: 'text/html', path: '/', note: 'The site itself.' },
  { mediaType: 'text/markdown', path: '/index.md', note: 'The whole site as Markdown.' },
  {
    mediaType: 'application/feed+json',
    path: '/feed.json',
    note: 'JSON Feed 1.1, with the _fyi extension on every item.',
  },
  {
    mediaType: 'application/atom+xml',
    path: '/feed.xml',
    note: 'Atom, with full rendered content per entry.',
  },
  {
    mediaType: 'text/plain',
    path: '/llms.txt',
    note: 'When this corpus is useful, and when it is not.',
  },
  {
    mediaType: 'application/json',
    path: '/api/fyi/q/summary',
    note: 'The read-only query API. Schema at /openapi.json.',
  },
] as const;

/** Plain-text table, used verbatim as the 406 body. */
export function representationList(origin?: string): string {
  const base = origin ?? '';
  const rows = REPRESENTATIONS.map(
    (entry) =>
      `  ${entry.mediaType.padEnd(24)} ${origin ? `${base}${entry.path}` : absoluteUrl(entry.path)}`,
  ).join('\n');
  return `Available representations of this resource:\n\n${rows}\n`;
}
