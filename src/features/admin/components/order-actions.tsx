'use client';

import { useState, useTransition } from 'react';
import { runOrderAction } from '@/features/admin/actions';

type Action = {
  key:
    | 'reprocess_story'
    | 'regenerate_preview'
    | 'regenerate_full'
    | 'resend_delivery'
    | 'cancel_order'
    | 'toggle_flag';
  label: string;
  /** Ações destrutivas ou que geram custo pedem confirmação. */
  confirm?: string;
};

const ACTIONS: Action[] = [
  {
    key: 'reprocess_story',
    label: 'Reprocessar história',
    confirm: 'Isso descarta a letra atual e cria uma nova. Continuar?',
  },
  {
    key: 'regenerate_preview',
    label: 'Regenerar prévia',
    confirm: 'Isso gera uma nova prévia e consome crédito. Continuar?',
  },
  {
    key: 'regenerate_full',
    label: 'Regenerar música',
    confirm:
      'Isso grava a música do zero e consome crédito de novo. A gravação atual ' +
      'sai do ar até a nova ficar pronta — inclusive para um pedido já entregue. Continuar?',
  },
  { key: 'resend_delivery', label: 'Reenviar entrega' },
  {
    key: 'cancel_order',
    label: 'Cancelar pedido',
    confirm: 'O pedido será cancelado. Esta ação não pode ser desfeita. Continuar?',
  },
  { key: 'toggle_flag', label: 'Marcar para revisão' },
];

export function OrderActions({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  function run(action: Action) {
    if (action.confirm && !window.confirm(action.confirm)) return;

    setRunning(action.key);
    setFeedback(null);

    startTransition(async () => {
      const result = await runOrderAction(orderId, action.key);
      setFeedback(result);
      setRunning(null);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => run(action)}
            disabled={pending}
            className="rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-wine-200 hover:text-wine-700 disabled:opacity-50"
          >
            {running === action.key ? 'Executando…' : action.label}
          </button>
        ))}
      </div>

      {feedback ? (
        <p
          role="status"
          className={`mt-3 text-sm ${feedback.ok ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
