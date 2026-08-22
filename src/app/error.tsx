'use client';

import { useEffect } from 'react';

/**
 * Erro global.
 *
 * O consumidor vê uma mensagem acolhedora; o detalhe técnico fica no console do
 * servidor e no painel. Nunca exibimos stack, código de provider ou status HTTP.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'ui.render_error', digest: error.digest }));
  }, [error]);

  return (
    <main className="app-container py-20">
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl">Tivemos um probleminha por aqui</h1>
        <p className="mt-3 text-ink-soft">
          Seu pedido está seguro. Tente novamente em instantes — se persistir, é só falar com a
          gente.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-8">
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
