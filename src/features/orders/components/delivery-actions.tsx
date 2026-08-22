'use client';

import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';

/**
 * Ações da página de entrega.
 *
 * O download aponta para a rota assinada — não existe link direto para o
 * arquivo no storage.
 */
export function DeliveryActions({
  downloadUrl,
  shareText,
  shareUrl,
}: {
  downloadUrl: string;
  shareText: string;
  shareUrl: string;
}) {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    track('delivery_opened');
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function share() {
    try {
      await navigator.share({ title: shareText, text: shareText, url: shareUrl });
    } catch {
      // Cancelado pelo usuário ou indisponível: nada a fazer.
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <a
        href={downloadUrl}
        className="btn-primary flex-1"
        onClick={() => track('song_downloaded')}
      >
        Baixar minha música
      </a>

      {canShare ? (
        <button type="button" onClick={share} className="btn-ghost flex-1">
          Compartilhar
        </button>
      ) : (
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(shareUrl);
          }}
        >
          Copiar link
        </button>
      )}
    </div>
  );
}
