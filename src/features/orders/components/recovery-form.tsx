'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTimeBR } from '@/lib/format';
import type { RecoveredOrder } from '@/services/recovery-service';

export function RecoveryForm() {
  const [whatsapp, setWhatsapp] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [orders, setOrders] = useState<RecoveredOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrders(null);

    try {
      const response = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp, recipientName }),
      });

      const body = (await response.json()) as { orders: RecoveredOrder[]; message?: string };

      if (!response.ok) {
        setError(body.message ?? 'Não conseguimos buscar agora. Tente em instantes.');
        return;
      }

      setOrders(body.orders);
    } catch {
      setError('Não conseguimos buscar agora. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl">Encontrar minha música</h1>
        <p className="mt-2 text-ink-soft">
          Informe o WhatsApp que você usou no pedido e o nome de quem ia receber a música.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="field-label">WhatsApp</span>
            <input
              className="field-input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="field-label">Para quem era a música?</span>
            <input
              className="field-input"
              placeholder="Ex.: Marina"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Procurando…' : 'Procurar minha música'}
          </button>
        </form>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-wine-700">
            {error}
          </p>
        ) : null}

        {orders?.length === 0 ? (
          <div className="mt-6 rounded-xl bg-wine-50 p-4 text-sm text-ink-soft">
            <p className="font-medium text-wine-700">Não encontramos nenhuma música com esses dados.</p>
            <p className="mt-1">
              Confira se o número tem DDD e se o nome está escrito como você digitou no pedido.
            </p>
          </div>
        ) : null}

        {orders && orders.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {orders.map((order) => (
              <li key={order.path}>
                <Link
                  href={order.path}
                  className="block rounded-2xl border border-cream-deep p-4 transition hover:border-wine-200 hover:bg-wine-50"
                >
                  <p className="font-semibold">Música para {order.recipientName}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {order.occasionLabel} · {formatDateTimeBR(order.createdAt)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-wine-700">
                    {order.statusLabel} →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Ainda não criou a sua?{' '}
        <Link href="/criar" className="underline">
          Criar minha música
        </Link>
      </p>
    </div>
  );
}
