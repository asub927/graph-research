import Link from 'next/link';

/**
 * Two-row footer: the machine-readable entry points first, then the prose
 * pages. Agents that reach a page without reading `/llms.txt` still find the
 * feed and the API from any point in the site.
 */

const AGENT_LINKS = [
  { href: '/docs', label: 'API & docs' },
  { href: '/agents', label: 'agent instructions' },
  { href: '/openapi.json', label: 'OpenAPI' },
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/feed.json', label: 'JSON feed' },
  { href: '/feed.xml', label: 'Atom' },
];

const SITE_LINKS = [
  { href: '/about', label: 'about' },
  { href: '/contact', label: 'contact' },
  { href: '/privacy', label: 'privacy' },
  { href: '/colophon', label: 'colophon' },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <ul>
        <li className="site-footer-label">For agents &amp; developers:</li>
        {AGENT_LINKS.map((link) => (
          <li key={link.href}>
            {/* Feeds and specs are files, not routes; a plain anchor avoids a
                needless client-side navigation attempt. */}
            {link.href.includes('.') ? (
              <a href={link.href}>{link.label}</a>
            ) : (
              <Link href={link.href}>{link.label}</Link>
            )}
          </li>
        ))}
      </ul>
      <ul>
        {SITE_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </footer>
  );
}
