import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetching and extracting readable prose from a source URL.
 *
 * The ingest endpoint is authenticated, but it still takes an arbitrary URL and
 * fetches it server-side, so it refuses to resolve private address space. That
 * closes the obvious hole where a pasted `http://169.254.169.254/...` would
 * turn the publish pipeline into a cloud-metadata proxy.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 4 * 1024 * 1024;

export interface Extraction {
  url: string;
  title: string | null;
  text: string;
  /** True when Readability found an article body rather than raw page text. */
  structured: boolean;
}

export class ExtractionError extends Error {}

function isPrivateAddress(address: string): boolean {
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd')) {
    return true;
  }
  if (address.startsWith('fe80')) return true;

  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Reject anything that is not a public http(s) address. */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExtractionError(`not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ExtractionError(`unsupported protocol: ${url.protocol}`);
  }

  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new ExtractionError(`refusing to fetch a local address: ${host}`);
  }

  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => {
        throw new ExtractionError(`could not resolve host: ${host}`);
      })).map((entry) => entry.address);

  if (addresses.length === 0) {
    throw new ExtractionError(`could not resolve host: ${host}`);
  }
  if (addresses.some(isPrivateAddress)) {
    throw new ExtractionError(`refusing to fetch a private address: ${host}`);
  }

  return url;
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(
    // Concatenate manually; Blob would buffer a second copy.
    chunks.reduce<Uint8Array>((accumulator, chunk) => {
      const merged = new Uint8Array(accumulator.length + chunk.length);
      merged.set(accumulator);
      merged.set(chunk, accumulator.length);
      return merged;
    }, new Uint8Array()),
  );
}

/** Strip tags from a raw HTML document, for non-article pages. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a URL and extract its title and readable prose.
 *
 * Falls back to tag-stripping when Readability cannot find an article, which is
 * common for repository pages, documentation indexes, and social posts — all of
 * which are legitimate things to log.
 */
export async function fetchAndExtract(rawUrl: string): Promise<Extraction> {
  const url = await assertPublicUrl(rawUrl);

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Identify honestly; some sites serve different markup to unknown agents.
      'user-agent': 'fyi-site/0.1 (+link log; summarises pages on publish)',
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
    },
  }).catch((error: Error) => {
    throw new ExtractionError(`could not fetch ${url.href}: ${error.message}`);
  });

  if (!response.ok) {
    throw new ExtractionError(`source returned ${response.status} for ${url.href}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = await readCapped(response);

  if (!contentType.includes('html')) {
    return {
      url: response.url || url.href,
      title: null,
      text: body.slice(0, 40_000),
      structured: false,
    };
  }

  const { JSDOM } = await import('jsdom');
  const { Readability, isProbablyReaderable } = await import('@mozilla/readability');

  const dom = new JSDOM(body, { url: response.url || url.href });
  const document = dom.window.document;
  const documentTitle = document.title?.trim() || null;

  if (isProbablyReaderable(document)) {
    const article = new Readability(document).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return {
        url: response.url || url.href,
        title: article.title?.trim() || documentTitle,
        text: article.textContent.replace(/\s+/g, ' ').trim().slice(0, 40_000),
        structured: true,
      };
    }
  }

  // No article body. Prefer the meta description, which is usually a real
  // summary, and append page text so the summariser has something to work with.
  const metaDescription =
    document
      .querySelector('meta[name="description"], meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() ?? '';

  const pageText = htmlToText(body);

  return {
    url: response.url || url.href,
    title: documentTitle,
    text: [metaDescription, pageText].filter(Boolean).join(' ').slice(0, 40_000),
    structured: false,
  };
}
