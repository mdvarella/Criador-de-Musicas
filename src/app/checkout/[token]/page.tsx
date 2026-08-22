import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { CardCheckout } from '@/features/payments/components/card-checkout';
import { PixCheckout } from '@/features/payments/components/pix-checkout';
import { isAppError } from '@/lib/errors';
import { publicEnv } from '@/lib/env';
import { getPublicOrderView } from '@/services/order-view-service';
import { getSettings } from '@/services/settings-service';

export const metadata: Metadata = {
  title: 'Finalizar pedido',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await getPublicOrderView(token);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  // Pedido já pago não tem checkout: volta para a página da música.
  if (view.paid) redirect(`/musica/${token}`);

  const settings = await getSettings();
  const pixEnabled = settings.payment_methods.includes('pix');
  const cardEnabled = settings.payment_methods.includes('card') && publicEnv.mercadoPagoPublicKey;

  return (
    <>
      <SiteHeader />

      <main className="app-container py-10 sm:py-16">
        <div className="mx-auto w-full max-w-xl space-y-6">
          {/* ----------------------------------------------- Resumo do pedido */}
          <section className="card p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl">Sua música completa</h1>
            <p className="mt-2 text-ink-soft">
              Música personalizada para <strong>{view.recipientName}</strong>
            </p>

            <dl className="mt-6 space-y-2 text-sm">
              <Row label="Ocasião" value={view.occasionLabel} />
              <Row label="Estilo" value={view.styleLabel} />
              <Row label="Clima" value={view.toneLabel} />
            </dl>

            <div className="mt-6 flex items-baseline justify-between border-t border-cream-deep pt-5">
              <span className="text-ink-soft">Total</span>
              <span className="font-display text-3xl">{view.priceFormatted}</span>
            </div>

            <ul className="mt-5 space-y-1.5 text-sm text-ink-soft">
              <li>✓ Música completa, com todos os versos e refrão</li>
              <li>✓ Arquivo para ouvir, baixar e compartilhar</li>
              <li>✓ Link exclusivo de entrega, só seu</li>
            </ul>
          </section>

          {/* -------------------------------------------------- Pagamento PIX */}
          {pixEnabled ? (
            <section className="card p-6 sm:p-8">
              <h2 className="text-xl">Pagar com PIX</h2>
              <p className="mt-1 mb-5 text-sm text-ink-soft">
                Aprovação em segundos. Sua música começa a ser criada logo depois.
              </p>

              <PixCheckout
                publicToken={view.publicToken}
                initialPix={view.pendingPix}
                priceFormatted={view.priceFormatted}
              />
            </section>
          ) : null}

          {/* ----------------------------------------------- Pagamento cartão */}
          {cardEnabled ? (
            <section className="card p-6 sm:p-8">
              <h2 className="text-xl">Pagar com cartão</h2>
              <p className="mt-1 mb-5 text-sm text-ink-soft">
                Os dados do cartão são digitados diretamente no ambiente seguro do processador de
                pagamentos. Não guardamos nada.
              </p>

              <CardCheckout
                publicToken={view.publicToken}
                publicKey={publicEnv.mercadoPagoPublicKey}
                amountCents={view.amountCents}
              />
            </section>
          ) : null}

          <p className="text-center text-sm text-ink-soft">
            <Link href={`/musica/${view.publicToken}`} className="underline">
              Voltar para a prévia
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
