'use client';

import { useState, useTransition } from 'react';
import { saveSetting } from '@/features/admin/actions';
import type { AppSettings, SettingKey } from '@/services/settings-service';

type FieldKind = 'number' | 'boolean' | 'text' | 'list';

type FieldDef = {
  key: SettingKey;
  label: string;
  hint: string;
  kind: FieldKind;
};

const FIELDS: FieldDef[] = [
  {
    key: 'product_price_cents',
    label: 'Preço STANDARD (centavos)',
    hint: 'Fonte única de verdade da cobrança. 4990 = R$ 49,90.',
    kind: 'number',
  },
  {
    key: 'product_price_premium_cents',
    label: 'Preço PREMIUM (centavos)',
    hint: 'Usado quando o plano PREMIUM for liberado para venda.',
    kind: 'number',
  },
  {
    key: 'preview_enabled',
    label: 'Prévia habilitada',
    hint: 'Desligado, o pedido segue direto para o checkout.',
    kind: 'boolean',
  },
  {
    key: 'preview_duration_seconds',
    label: 'Duração da prévia (segundos)',
    hint: 'Entre 10 e 20 segundos costuma converter melhor.',
    kind: 'number',
  },
  {
    key: 'full_song_duration_seconds',
    label: 'Duração da música completa (segundos)',
    hint: 'Impacta diretamente o custo de geração.',
    kind: 'number',
  },
  {
    key: 'max_generation_attempts',
    label: 'Máximo de tentativas por geração',
    hint: 'Teto absoluto de retentativas. Evita gasto em loop.',
    kind: 'number',
  },
  {
    key: 'active_llm_provider',
    label: 'Provider de letra',
    hint: 'openai | mock',
    kind: 'text',
  },
  {
    key: 'active_music_provider',
    label: 'Provider de música',
    hint: 'elevenlabs | minimax | mock',
    kind: 'text',
  },
  {
    key: 'active_preview_music_provider',
    label: 'Provider da prévia',
    hint: 'Vazio = o mesmo da música. Use elevenlabs aqui se a música for minimax: o MiniMax não controla duração e a prévia sairia inteira.',
    kind: 'text',
  },
  {
    key: 'minimax_cost_per_generation_usd',
    label: 'Custo por geração no MiniMax (USD)',
    hint: 'O MiniMax cobra por geração, não por minuto.',
    kind: 'number',
  },
  {
    key: 'active_payment_provider',
    label: 'Provider de pagamento',
    hint: 'mercadopago | mock',
    kind: 'text',
  },
  {
    key: 'payment_methods',
    label: 'Meios de pagamento',
    hint: 'Separados por vírgula. Ex.: pix,card',
    kind: 'list',
  },
  {
    key: 'available_plans',
    label: 'Planos à venda',
    hint: 'Separados por vírgula. Ex.: STANDARD',
    kind: 'list',
  },
  {
    key: 'payment_fee_percent',
    label: 'Taxa do gateway (%)',
    hint: 'Usada apenas para estimar margem no painel.',
    kind: 'number',
  },
  {
    key: 'music_cost_per_minute_usd',
    label: 'Custo por minuto de áudio (USD)',
    hint: 'Base da estimativa de custo de cada geração.',
    kind: 'number',
  },
  {
    key: 'maintenance_mode',
    label: 'Modo manutenção',
    hint: 'Ligado, o formulário para de aceitar novos pedidos.',
    kind: 'boolean',
  },
];

export function SettingsForm({ settings }: { settings: AppSettings }) {
  return (
    <div className="space-y-4">
      {FIELDS.map((field) => (
        <SettingRow key={field.key} field={field} value={settings[field.key]} />
      ))}
    </div>
  );
}

function SettingRow({ field, value }: { field: FieldDef; value: AppSettings[SettingKey] }) {
  const [draft, setDraft] = useState(() => toInput(value, field.kind));
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const parsed = fromInput(draft, field.kind);
      const result = await saveSetting(field.key, parsed as never);
      setFeedback(result);
    });
  }

  return (
    <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
      <div className="flex-1">
        <span className="field-label">{field.label}</span>

        {field.kind === 'boolean' ? (
          <select
            className="field-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        ) : (
          <input
            className="field-input"
            type={field.kind === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}

        <span className="mt-1 block text-xs text-ink-soft">{field.hint}</span>

        {feedback ? (
          <span
            className={`mt-1 block text-xs ${feedback.ok ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {feedback.message}
          </span>
        ) : null}
      </div>

      <button type="button" onClick={save} disabled={pending} className="btn-ghost">
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}

function toInput(value: unknown, kind: FieldKind): string {
  if (kind === 'list' && Array.isArray(value)) return value.join(',');
  return String(value);
}

function fromInput(raw: string, kind: FieldKind): unknown {
  if (kind === 'number') return Number(raw);
  if (kind === 'boolean') return raw === 'true';
  if (kind === 'list') {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return raw.trim();
}
