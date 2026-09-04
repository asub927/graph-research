import Link from 'next/link';
import { site } from '@/lib/config';

/**
 * Header, standing introduction, and primary navigation.
 *
 * Deliberately carries no active-page state: knowing the current path in a
 * layout means either shipping a client component or reading request headers,
 * and both would cost every page either JavaScript (R16) or its static render.
 * A nine-item flat nav does not need the affordance.
 */

const NAV: Array<{ href: string; label: string; offsite?: boolean }> = [
  { href: '/', label: 'latest' },
  { href: '/themes', label: 'themes' },
  { href: '/search', label: 'search' },
  { href: '/connected', label: 'connected' },
  { href: '/graph', label: 'graph' },
  { href: '/random', label: 'random' },
  { href: '/about', label: 'about' },
  { href: '/agents', label: 'for your agent' },
];

export function Masthead() {
  const nav = site.essaysUrl
    ? [
        ...NAV.slice(0, 6),
        { href: site.essaysUrl, label: 'essays', offsite: true },
        ...NAV.slice(6),
      ]
    : NAV;

  return (
    <header className="masthead">
      <p className="masthead-brand">
        <Link href="/">{site.title}</Link>
      </p>
      <p className="masthead-intro">
        I&rsquo;m {site.author}, and this is <strong>For Your Information</strong> &mdash;{' '}
        {site.tagline.charAt(0).toLowerCase() + site.tagline.slice(1)}
      </p>
      {/* R1: the disclaimer is standing, not per-item. */}
      <p className="masthead-note">
        {site.disclaimer} <Link href="/about">How to use this site &rarr;</Link>
      </p>
      <nav className="site-nav" aria-label="Primary">
        <ul>
          {nav.map((entry) => (
            <li key={entry.href} className={entry.offsite ? 'nav-offsite' : undefined}>
              {entry.offsite ? (
                <a href={entry.href} rel="noopener">
                  {entry.label}
                </a>
              ) : (
                <Link href={entry.href}>{entry.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
