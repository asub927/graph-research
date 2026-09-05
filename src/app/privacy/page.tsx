import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/config';
import { RATE_LIMIT } from '@/lib/rate-limit';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy',
  description: `What ${site.title} collects, which is close to nothing, stated specifically.`,
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <>
      <h1 className="page-title">Privacy</h1>
      <p className="page-intro">
        No cookies, no analytics, no trackers, no fonts or scripts from anyone
        else&rsquo;s server. Nothing on this site tries to work out who you are.
      </p>

      <section className="prose" aria-labelledby="specifics">
        <h2 id="specifics">The specifics</h2>
        <dl>
          <div>
            <dt>Cookies</dt>
            <dd>
              None are set. Nothing here needs to remember you between
              requests, including the dark theme, which follows your
              system setting rather than a stored preference.
            </dd>
          </div>
          <div>
            <dt>Analytics</dt>
            <dd>
              None. No page-view counter, no session recorder, no heatmap, no
              pixel.
            </dd>
          </div>
          <div>
            <dt>Third-party resources</dt>
            <dd>
              None. Fonts are the ones already on your device; every script and
              stylesheet is served from this origin, which the Content Security
              Policy also enforces.
            </dd>
          </div>
          <div>
            <dt>Search</dt>
            <dd>
              Queries are sent to this site&rsquo;s own API to be matched
              against the corpus, and are not logged with anything identifying.
              If an embedding provider is configured for this deployment, the
              text of a query is sent to it to be turned into a vector; nothing
              else about you goes with it.
            </dd>
          </div>
          <div>
            <dt>Server logs</dt>
            <dd>
              The host records requests, as every web server does. That is
              outside this site&rsquo;s code and is used for nothing here.
            </dd>
          </div>
          <div>
            <dt>Rate limiting</dt>
            <dd>
              The query API counts recent requests per client address in memory
              &mdash; {RATE_LIMIT.limit} per {RATE_LIMIT.windowSeconds} seconds
              &mdash; and forgets them as the window passes. Nothing is written
              to disk and nothing is retained.
            </dd>
          </div>
          <div>
            <dt>Outbound links</dt>
            <dd>
              Following one takes you to someone else&rsquo;s site, under
              someone else&rsquo;s policy. Links here carry{' '}
              <code>noopener</code> and do not pass a referrer beyond the origin.
            </dd>
          </div>
        </dl>
      </section>

      <section className="prose" aria-labelledby="agents">
        <h2 id="agents">If you are crawling this</h2>
        <p>
          <a href="/robots.txt">robots.txt</a> distinguishes crawlers that
          surface this site to a reader with a link back from ones that collect
          it into a training corpus. The first are allowed and the second are
          not, and both are named rather than left to a silent default. Nothing
          about a crawl is recorded here beyond the host&rsquo;s own request log.
        </p>
        <p>
          Everything published is public and meant to be read, by people and by
          machines. See <Link href="/agents">/agents</Link> for the efficient way
          to do the second.
        </p>
      </section>
    </>
  );
}
