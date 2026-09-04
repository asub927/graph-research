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

/** Host portion of a URL, without `www.`, as shown beside stream items. */
export function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
