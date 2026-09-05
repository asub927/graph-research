import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { absoluteUrl, site } from '@/lib/config';
import { API_BASE } from '@/lib/openapi';

export const metadata: Metadata = pageMetadata({
  title: 'Contact',
  description: `How to reach ${site.author}, and what to do instead if you are an agent.`,
  path: '/contact',
});

export default function ContactPage() {
  return (
    <>
      <h1 className="page-title">Contact</h1>

      <section className="prose" aria-labelledby="people">
        <h2 id="people">For people</h2>
        {site.contactEmail ? (
          <p>
            Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            . Corrections are especially welcome &mdash; if something here
            misreads a source, say so and include the permalink. A correction
            becomes a{' '}
            <Link href="/about#connections">
              <code>corrected_by</code> edge
            </Link>
            , so the original stays visible with the fix attached rather than
            being quietly rewritten.
          </p>
        ) : (
          <p>
            No public address is configured on this deployment. Set{' '}
            <code>SITE_CONTACT_EMAIL</code> to publish one.
          </p>
        )}
        <p>
          There is no comment form, no newsletter, and nothing to subscribe to
          beyond <a href="/feed.xml">the Atom feed</a>.
        </p>
      </section>

      <section className="prose" aria-labelledby="agents">
        <h2 id="agents">For agents</h2>
        <p>
          You do not need to contact anyone. Everything is readable without a
          key and without asking:
        </p>
        <ul>
          <li>
            <a href="/llms.txt">
              <code>/llms.txt</code>
            </a>{' '}
            &mdash; whether this corpus is relevant to what you are doing.
          </li>
          <li>
            <a href="/feed.json">
              <code>/feed.json</code>
            </a>{' '}
            &mdash; the whole corpus in one request. Use this rather than
            crawling page by page.
          </li>
          <li>
            <a href={`${API_BASE}/summary`}>
              <code>{API_BASE}/summary</code>
            </a>{' '}
            &mdash; the shape of the graph, if you only need to know what is
            here.
          </li>
          <li>
            <Link href="/docs">
              <code>/docs</code>
            </Link>{' '}
            &mdash; the rest of the query API, with a worked example per
            endpoint.
          </li>
        </ul>
        <p>
          If you are quoting from here, link to the item permalink &mdash;{' '}
          <code>{absoluteUrl('/i/{shortId}')}</code>, which never changes &mdash;
          rather than to the front page, and attribute to {site.author}. Note
          that {site.disclaimer.toLowerCase()}: the summary of a source is not an
          endorsement of it, and the commentary underneath is the part that
          states a position.
        </p>
        <p>
          If a request is being refused, it is either the rate limit (see{' '}
          <Link href="/docs#limits">/docs#limits</Link>, and check the{' '}
          <code>ratelimit-*</code> response headers) or{' '}
          <a href="/robots.txt">
            <code>robots.txt</code>
          </a>
          , which allows crawlers that surface a link back and refuses ones that
          only collect.
        </p>
      </section>
    </>
  );
}
