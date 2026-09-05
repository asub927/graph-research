import { NextResponse, type NextRequest } from 'next/server';
import { negotiate } from './lib/negotiate.ts';
import { representationList } from './lib/representations.ts';

/**
 * Content negotiation for page routes (R10).
 *
 * Three outcomes. A request that asks for `text/markdown` is rewritten to
 * `/index.md`. A request that can take HTML — which includes every browser and
 * every wildcard client — is served the page. A request that explicitly accepts
 * neither gets 406 with a plain-text list of what is on offer, rather than a
 * page it already said it could not read.
 *
 * `Vary: Accept` goes on every response, because the same URL now has two
 * representations and a cache that does not know that will hand HTML to an
 * agent asking for Markdown.
 *
 * This is why page routes cannot be plain static files: the choice is made per
 * request. The rendered output on either branch is still cached.
 */

export function middleware(request: NextRequest): NextResponse {
  const outcome = negotiate(request.headers.get('accept'));

  if (outcome === 'markdown') {
    const url = request.nextUrl.clone();
    url.pathname = '/index.md';
    url.search = '';
    const response = NextResponse.rewrite(url);
    response.headers.set('vary', 'Accept');
    return response;
  }

  if (outcome === 'html') {
    const response = NextResponse.next();
    response.headers.set('vary', 'Accept');
    return response;
  }

  // The client named types and none of them was one we serve here. Point it at
  // the representations that do exist; the list is plain text so a client that
  // rejected both HTML and Markdown can still read the answer. The origin comes
  // from the request rather than from configuration, so a preview deployment
  // lists its own URLs.
  return new NextResponse(representationList(request.nextUrl.origin), {
    status: 406,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      vary: 'Accept',
    },
  });
}

export const config = {
  /**
   * Page routes only. The API negotiates nothing — it is JSON or a problem
   * document — and the generated files (`/feed.json`, `/index.md`, `/llms.txt`,
   * `/openapi.json`, `/sitemap.xml`, `/robots.txt`) already are the alternative
   * representations, so rewriting them to Markdown would be circular.
   */
  matcher: ['/((?!api/|_next/|.*\\.).*)'],
};
