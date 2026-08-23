import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { RecoveryForm } from '@/features/orders/components/recovery-form';

export const metadata: Metadata = {
  title: 'Encontrar minha música',
  description: 'Reencontre a música que você criou.',
  robots: { index: false, follow: false },
};

export default function RecoveryPage() {
  return (
    <>
      <SiteHeader />
      <main className="app-container py-10 sm:py-16">
        <RecoveryForm />
      </main>
      <SiteFooter />
    </>
  );
}
