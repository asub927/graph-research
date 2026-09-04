import type { Metadata } from 'next';
import './globals.css';
import { Masthead } from '@/components/Masthead';
import { SiteFooter } from '@/components/SiteFooter';
import { site } from '@/lib/config';
import { jsonLdScript, siteGraph } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: `%s — ${site.title}`,
  },
  description: site.tagline,
  authors: [{ name: site.author }],
  alternates: {
    canonical: '/',
    types: {
      'application/atom+xml': '/feed.xml',
      'application/feed+json': '/feed.json',
      // Advertising the Markdown representation is what makes the Accept
      // negotiation in middleware.ts discoverable (R10).
      'text/markdown': '/index.md',
    },
  },
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
