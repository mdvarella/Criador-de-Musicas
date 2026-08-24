'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { centsToAmount } from '@/lib/money';

/**
 * Pagamento com cartão via Payment Brick do Mercado Pago.
 *
 * Os campos do cartão são renderizados dentro do iframe do gateway: número,
 * validade e CVV nunca passam pelo nosso DOM nem pelo nosso servidor. Nós
 * recebemos apenas o token gerado pelo SDK e o enviamos para `/api/checkout`.
 *
 * LIMITAÇÃO REGISTRADA: o Brick exige a chave pública do gateway. Sem
 * `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`, o bloco de cartão simplesmente não
 * aparece e o PIX segue disponível.
 */

type BrickController = { unmount: () => void };

type MercadoPagoSdk = {
  bricks: () => {
    create: (
      type: 'cardPayment',
      containerId: string,
      settings: Record<string, unknown>,
    ) => Promise<BrickController>;
  };
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoSdk;
  }
}

const CONTAINER_ID = 'card-payment-brick';
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

export function CardCheckout({
  publicToken,
  publicKey,
  amountCents,
}: {
  publicToken: string;
  publicKey: string;
  amountCents: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const controllerRef = useRef<BrickController | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Referência local ao controller: `controllerRef` só é preenchido quando a
    // criação resolve, e a limpeza pode rodar antes disso.
    let localController: BrickController | null = null;

    async function mount() {
      try {
        await loadSdk();
        if (cancelled || !window.MercadoPago) return;

        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const controller = await mp.bricks().create('cardPayment', CONTAINER_ID, {
          initialization: { amount: centsToAmount(amountCents) },
          customization: { visual: { style: { theme: 'default' } } },
          callbacks: {
            onReady: () => setReady(true),
            onError: () =>
              setError('Não conseguimos carregar o formulário do cartão. Tente o PIX.'),
            onSubmit: async (formData: {
              token?: string;
              installments?: number;
              payment_method_id?: string;
              issuer_id?: string;
              payer?: { identification?: { number?: string } };
            }) => {
              const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  publicToken,
                  method: 'card',
                  cardToken: formData.token,
                  installments: formData.installments,
                  paymentMethodId: formData.payment_method_id,
                  issuerId: formData.issuer_id,
                  identificationNumber: formData.payer?.identification?.number,
                }),
              });

              const body = (await response.json()) as { status?: string; message?: string };

              if (!response.ok) {
                setError(body.message ?? 'Não conseguimos concluir o pagamento.');
                return;
              }

              // O status definitivo vem do servidor; a tela apenas acompanha.
              router.push(`/musica/${publicToken}`);
              router.refresh();
            },
          },
        });

        localController = controller;

        // O efeito foi cancelado enquanto a criação acontecia (o Strict Mode do
        // React faz exatamente isso em desenvolvimento). Desmonta o que acabou
        // de nascer, senão ele fica ocupando o container e a montagem seguinte
        // não consegue renderizar o formulário.
        if (cancelled) {
          controller.unmount();
          localController = null;
          return;
        }

        controllerRef.current = controller;
      } catch {
        if (!cancelled) {
          setError('Não conseguimos carregar o pagamento com cartão. Tente o PIX.');
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;

      // `localController` cobre o caso da criação ainda em voo; `controllerRef`
      // cobre a montagem que chegou a concluir.
      localController?.unmount();
      controllerRef.current?.unmount();
      localController = null;
      controllerRef.current = null;

      // O SDK nem sempre limpa o que injetou. Sem esvaziar o container, a
      // remontagem encontra um resto de DOM e falha em silêncio.
      const container = document.getElementById(CONTAINER_ID);
      if (container) container.innerHTML = '';
    };
  }, [amountCents, publicKey, publicToken, router]);

  return (
    <div>
      <div id={CONTAINER_ID} />
      {!ready && !error ? (
        <p className="text-sm text-ink-soft">Carregando o formulário do cartão…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-wine-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('falha ao carregar o SDK do gateway'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}
