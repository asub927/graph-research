import type { Metadata } from 'next';
import { CaptureForm } from '@/components/CaptureForm';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Capture',
  description: 'Authenticated capture form.',
  path: '/admin',
  noIndex: true,
});

export default function AdminPage() {
  return (
    <div className="prose">
      <h1 className="page-title">Capture</h1>
      <p className="page-intro">
        Paste a URL and the pipeline fetches it, writes a summary, embeds it, and
        proposes typed connections to what is already here. Nothing on this page
        is public.
      </p>
      <CaptureForm />
    </div>
  );
}
