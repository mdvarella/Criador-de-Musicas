'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AudioPlayer } from '@/components/audio-player';
import { track } from '@/lib/analytics';
import type { PublicOrderView } from '@/services/order-view-service';

/**
 * Tela de acompanhamento e venda da prévia (item 10 da especificação).
 *
 * Enquanto o pedido está sendo processado, faz polling curto e mostra uma
 * mensagem afetiva — nunca "processando job" ou qualquer termo técnico. Quando
 * a prévia fica pronta, a tela vira uma página de venda.
 */
export function OrderProgress({ initial }: { initial: PublicOrderView }) {
  const [view, setView] = useState(initial);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!view.processing) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${view.publicToken}/status`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const next = (await response.json()) as PublicOrderView;
        setView(next);
      } catch {
        // Sem rede no momento: a próxima tentativa resolve.
      }
    }, 4000);

    pollingRef.current = interval;
    return () => clearInterval(interval);
  }, [view.processing, view.publicToken]);

  if (view.failed) {
    return (
      <Shell recipientName={view.recipientName}>
        <h1 className="text-2xl sm:text-3xl">Estamos cuidando da sua música</h1>
        <p className="mt-4 text-ink-soft">
          Tivemos um problema enquanto criávamos sua música. Seu pedido está seguro e vamos tentar
          novamente automaticamente. Assim que ficar pronta, avisamos você.
        </p>
      </Shell>
    );
  }

  if (view.deliveryPath) {
    return (
      <Shell recipientName={view.recipientName}>
        <h1 className="text-2xl sm:text-3xl">Sua música está pronta ❤️</h1>
        <p className="mt-4 text-ink-soft">Abra a página da sua música para ouvir e baixar.</p>
        <Link href={view.deliveryPath} className="btn-primary mt-6">
          Abrir minha música
        </Link>
      </Shell>
    );
  }

  if (view.paid) {
    return (
      <Shell recipientName={view.recipientName}>
        <h1 className="text-2xl sm:text-3xl">Pagamento confirmado 🎉</h1>
        <p className="mt-4 text-ink-soft">
          Sua música completa já entrou em produção. O link aparece aqui assim que ficar pronta —
          e você sempre pode voltar por{' '}
          <Link href="/minhas-musicas" className="underline">
            Encontrar minha música
          </Link>
          .
        </p>
        <PulsingNote />
      </Shell>
    );
  }

  if (view.preview.ready && view.preview.url) {
    return (
      <Shell recipientName={view.recipientName}>
        <h1 className="text-2xl sm:text-3xl">🎵 Sua música começou a ganhar vida.</h1>
        <p className="mt-3 text-ink-soft">
          Criamos uma prévia baseada na sua história. Ouça o trecho abaixo.
        </p>

        <div className="mt-6">
          <AudioPlayer
            src={view.preview.url}
            title={`Prévia para ${view.recipientName}`}
            subtitle={`${view.styleLabel} · ${view.toneLabel}`}
            playEvent="preview_played"
            orderToken={view.publicToken}
          />
        </div>

        <div className="mt-8 rounded-2xl bg-wine-50 p-5">
          <p className="font-semibold text-wine-700">Gostou?</p>
          <p className="mt-1 text-sm text-ink-soft">
            Desbloqueie a música completa, com todos os versos, refrão e a história inteira.
          </p>

          <Link
            href={`/checkout/${view.publicToken}`}
            className="btn-primary mt-5 w-full"
            onClick={() => track('checkout_started', {}, view.publicToken)}
          >
            Quero minha música completa
          </Link>

          <p className="mt-3 text-center text-sm text-ink-soft">{view.priceFormatted}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell recipientName={view.recipientName}>
      <h1 className="text-2xl sm:text-3xl">Estamos criando a música de {view.recipientName}</h1>
      <p className="mt-4 text-ink-soft">
        Lendo sua história com carinho e transformando cada detalhe em letra e melodia. Isso leva
        alguns instantes — pode deixar esta página aberta.
      </p>
      <PulsingNote />
      <p className="mt-6 text-sm text-ink-soft">
        Pode fechar a página se quiser. Para voltar, é só entrar em{' '}
        <Link href="/minhas-musicas" className="underline">
          Encontrar minha música
        </Link>{' '}
        com o seu WhatsApp e o nome de {view.recipientName}.
      </p>
    </Shell>
  );
}

function Shell({
  children,
  recipientName,
}: {
  children: React.ReactNode;
  recipientName: string;
}) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="mb-3 text-sm font-medium tracking-wide text-wine-600 uppercase">
        Música para {recipientName}
      </p>
      <div className="card p-6 sm:p-8">{children}</div>
    </div>
  );
}

function PulsingNote() {
  return (
    <div className="mt-8 flex items-center gap-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-wine-400"
          style={{ animationDelay: `${index * 200}ms` }}
        />
      ))}
      <span className="text-sm text-ink-soft">compondo…</span>
    </div>
  );
}
