import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AudioPlayer } from '@/components/audio-player';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { DeliveryActions } from '@/features/orders/components/delivery-actions';
import { absoluteUrl } from '@/lib/brand';
import { isAppError, toUserMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { getDeliveryView } from '@/services/order-view-service';

export const metadata: Metadata = {
  title: 'Sua música',
  // Link privado: nunca deve ser indexado.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await getDeliveryView(token);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND' && error.userMessage.includes('inválido')) {
      notFound();
    }

    return (
      <>
        <SiteHeader />
        <main className="app-container py-16">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <h1 className="text-2xl">Quase lá 💛</h1>
            <p className="mt-3 text-ink-soft">{toUserMessage(error)}</p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const shareUrl = absoluteUrl(`/sua-musica/${token}`);

  return (
    <>
      <SiteHeader />

      <main className="app-container py-10 sm:py-16">
        <div className="mx-auto w-full max-w-2xl">
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-br from-wine-700 to-wine-900 px-6 py-10 text-center text-white sm:px-10">
              <p className="text-sm tracking-wide text-white/70 uppercase">
                {view.occasionLabel}
              </p>
              <h1 className="mt-2 text-3xl text-white sm:text-4xl">Sua música está pronta ❤️</h1>
              <p className="mt-3 text-white/80">
                Feita a partir da sua história, para {view.recipientName}.
              </p>
            </div>

            <div className="p-6 sm:p-10">
              <AudioPlayer
                src={view.audioUrl}
                title={`Música para ${view.recipientName}`}
                subtitle={`${view.styleLabel} · ${view.toneLabel}${
                  view.durationSeconds ? ` · ${formatDuration(view.durationSeconds)}` : ''
                }`}
              />

              <DeliveryActions
                downloadUrl={view.downloadUrl}
                shareText={view.shareText}
                shareUrl={shareUrl}
              />

              {view.lyrics ? (
                <section className="mt-10">
                  <h2 className="text-xl">A letra</h2>
                  <pre className="mt-4 font-sans text-[0.95rem] leading-relaxed whitespace-pre-wrap text-ink-soft">
                    {view.lyrics}
                  </pre>
                </section>
              ) : null}

              <p className="mt-10 text-center text-sm text-ink-soft">
                Guarde este link com carinho: ele é o endereço permanente da sua música.
              </p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
