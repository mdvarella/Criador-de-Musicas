import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { OrderProgress } from '@/features/orders/components/order-progress';
import { isAppError } from '@/lib/errors';
import { getPublicOrderView } from '@/services/order-view-service';

export const metadata: Metadata = {
  title: 'Sua música',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OrderPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const view = await getPublicOrderView(token);

    return (
      <>
        <SiteHeader />
        <main className="app-container py-10 sm:py-16">
          <OrderProgress initial={view} />
        </main>
        <SiteFooter />
      </>
    );
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
