import { marked } from 'marked';

/**
 * Markdown rendering.
 *
 * Item bodies are Markdown: a blockquote summary, optionally followed by author
 * commentary. Raw HTML is stripped rather than passed through — the summary is
 * model-generated, and letting a model emit markup into the page is a needless
 * risk for a feature nobody needs.
 */

marked.setOptions({
  gfm: true,
  breaks: false,
});

function stripHtmlTags(markdown: string): string {
  return markdown.replace(/<\/?[a-zA-Z][^>]*>/g, '');
}

/** Render item content to HTML for the page and the Atom feed. */
export function renderMarkdown(markdown: string): string {
  return marked.parse(stripHtmlTags(markdown), { async: false });
}

/**
 * Flatten Markdown to plain text for meta descriptions, feed excerpts, and
 * search results. Drops the leading blockquote markers that would otherwise
 * show up verbatim in social previews — a visible defect on the reference site,
 * whose descriptions begin with a stray "> ".
 */
export function markdownToText(markdown: string): string {
  return stripHtmlTags(markdown)
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate on a word boundary, appending an ellipsis when shortened. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}\u2026`;
}

/** One-line summary for meta tags, feeds, and API excerpts. */
export function excerpt(markdown: string, maxLength = 200): string {
  return truncate(markdownToText(markdown), maxLength);
}

/**
 * Wrap prose as a Markdown blockquote. The publish pipeline uses this to build
 * the mandatory summary (R1) from a model response or an extractive fallback.
 */
export function asBlockquote(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `> ${paragraph.replace(/\n/g, '\n> ')}`)
    .join('\n>\n');
}

/**
 * Split an item body into its generated summary and its authored commentary.
 *
 * `asBlockquote` above fixes the convention this reads back: the summary is a
 * leading blockquote, and anything after the first unquoted line is the
 * author's. A body that does not start with a blockquote has no generated part
 * at all — a riff, or an essay pointer — and is entirely authored.
 *
 * Both re-publishing an item and backfilling the corpus need this boundary,
 * because both regenerate the summary and neither may touch the commentary.
 */
export function splitBody(content: string): { summary: string; commentary: string } {
  const lines = content.split('\n');
  let index = 0;
  while (index < lines.length && /^\s*>/.test(lines[index]!)) index += 1;

  if (index === 0) return { summary: '', commentary: content.trim() };

  return {
    summary: lines
      .slice(0, index)
      .map((line) => line.replace(/^\s*>\s?/, ''))
      .join('\n')
      .trim(),
    commentary: lines.slice(index).join('\n').trim(),
  };
}

/** Host portion of a URL, without `www.`, as shown beside stream items. */
export function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
