import type { Metadata } from 'next';
import './globals.css';
import { Masthead } from '@/components/Masthead';
import { SiteFooter } from '@/components/SiteFooter';
import { site } from '@/lib/config';
import { ALTERNATE_TYPES, jsonLdScript, siteGraph } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: `%s — ${site.title}`,
  },
  description: site.tagline,
  authors: [{ name: site.author }],
  // Only the fallback for a route that does not call pageMetadata; that helper
  // repeats the alternate types, because Next replaces this whole object
  // rather than merging into it. Advertising the Markdown representation is
  // what makes the Accept negotiation in middleware.ts discoverable (R10).
  alternates: { canonical: '/', types: ALTERNATE_TYPES },
  openGraph: {
    type: 'website',
    siteName: site.title,
    locale: 'en',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <script
          type="application/ld+json"
          // Site-level entities. Individual pages layer their own Article or
          // CollectionPage on top of this graph.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(siteGraph()) }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Masthead />
        {/* R17: exactly one <main> per page, which the reference omits. */}
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
