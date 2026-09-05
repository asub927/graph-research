import type { Metadata } from 'next';
import { StreamPageView } from '@/components/StreamPageView';
import { site } from '@/lib/config';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...pageMetadata({
    title: site.title,
    description: site.tagline,
    path: '/',
  }),
  // The home page carries the site name alone rather than the "%s — site"
  // template the other pages use.
  title: { absolute: site.title },
};

export default function HomePage() {
  return <StreamPageView page={1} />;
}
