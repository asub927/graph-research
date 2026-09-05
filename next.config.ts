import type { NextConfig } from 'next';

/**
 * Baseline security headers (R19). The reference site ships none at all.
 *
 * `script-src` and `style-src` allow inline content because the framework
 * injects an inline bootstrap and inline styles, and the JSON-LD blocks are
 * inline `application/ld+json` scripts. Tightening those to a nonce would force
 * every page to render dynamically, which would cost the static rendering the
 * whole site is built around. The rest of the policy is locked down: no
 * plugins, no framing, no base-tag rewriting, and no outbound connections
 * beyond this origin.
 */
const isDev = process.env.NODE_ENV === 'development';

const CSP = [
  "default-src 'self'",
  // `unsafe-eval` is development-only: the dev server's hot-reload runtime
  // evaluates strings, and without it the whole client bundle fails to boot.
  // It is never sent in production.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // These reach for native bindings, WASM, or Node internals that must not be
  // bundled: PGlite ships a WASM Postgres, jsdom and Readability are only used
  // server-side by the ingest pipeline.
  serverExternalPackages: [
    '@electric-sql/pglite',
    '@mozilla/readability',
    'jsdom',
    'pg',
  ],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // Page routes have two representations (R10), so a cache keyed on URL
        // alone would hand an agent's Markdown request the HTML it already
        // said it did not want. Middleware sets this too, but Next replaces
        // Vary with its own router value when it serves a prerendered page, so
        // the durable copy has to be declared here. API and generated-file
        // routes are excluded because each of those is a single representation.
        source: '/:path((?!api/).*)',
        headers: [{ key: 'Vary', value: 'Accept' }],
      },
      {
        // The query API is public and unauthenticated (R15), so it is explicitly
        // cross-origin readable — an agent calling it from a browser context
        // should not be blocked.
        source: '/api/fyi/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'content-type' },
        ],
      },
    ];
  },
};

export default nextConfig;
