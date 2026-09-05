/**
 * `Accept` header parsing, kept separate from the middleware so it can be
 * tested directly and so the middleware bundle stays dependency-free.
 */

export interface MediaRange {
  type: string;
  quality: number;
}

/** Parse an `Accept` header into media ranges, highest quality first. */
export function parseAccept(header: string): MediaRange[] {
  return header
    .split(',')
    .map((part) => {
      const [rawType, ...parameters] = part.split(';');
      const type = (rawType ?? '').trim().toLowerCase();
      const qParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='));
      const quality = qParameter ? Number.parseFloat(qParameter.slice(2)) : 1;
      return { type, quality: Number.isFinite(quality) ? quality : 1 };
    })
    .filter((range) => range.type.length > 0)
    .sort((a, b) => b.quality - a.quality);
}

/** Best quality the client assigned to a media type, through any range. */
export function qualityFor(ranges: readonly MediaRange[], mediaType: string): number {
  const [group] = mediaType.split('/');
  let best = 0;
  for (const range of ranges) {
    if (range.type === mediaType || range.type === `${group}/*` || range.type === '*/*') {
      best = Math.max(best, range.quality);
    }
  }
  return best;
}

export const MARKDOWN_TYPES = ['text/markdown', 'text/x-markdown'] as const;

export type Negotiation = 'html' | 'markdown' | 'unacceptable';

/**
 * Decide which representation to serve.
 *
 * Markdown has to be asked for by name. Matching it through a wildcard would
 * send every browser to the Markdown view, because browsers list `text/html`
 * and a wildcard at the same quality and the tie has to break somewhere. An
 * absent or empty header is no preference at all, which means HTML.
 */
export function negotiate(header: string | null): Negotiation {
  if (!header || header.trim() === '') return 'html';

  const ranges = parseAccept(header);
  const html = qualityFor(ranges, 'text/html');
  const markdown = Math.max(
    ...MARKDOWN_TYPES.map((type) => qualityFor(ranges, type)),
  );
  const namedMarkdown = ranges.some(
    (range) =>
      (MARKDOWN_TYPES as readonly string[]).includes(range.type) && range.quality > 0,
  );

  if (namedMarkdown && markdown >= html) return 'markdown';
  if (html > 0) return 'html';
  return 'unacceptable';
}
