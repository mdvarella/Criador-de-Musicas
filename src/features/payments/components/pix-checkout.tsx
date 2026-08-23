'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/analytics';
import { formatCPF, isValidCPF } from '@/lib/format';

type PixData = { qrCode: string | null; qrCodeBase64: string | null; expiresAt: string | null };

/**
 * Pagamento por PIX.
 *
 * A tela nunca considera o pagamento aprovado por conta própria: ela apenas
 * consulta o status do pedido, que só muda quando o servidor confirma a
 * transação junto ao gateway.
 */
export function PixCheckout({
  publicToken,
  initialPix,
  priceFormatted,
}: {
  publicToken: string;
  initialPix: PixData | null;
  priceFormatted: string;
}) {
  const router = useRouter();
  const [pix, setPix] = useState<PixData | null>(initialPix);
  const [cpf, setCpf] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pix) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${publicToken}/status`, { cache: 'no-store' });
        if (!response.ok) return;
        const view = (await response.json()) as { paid: boolean };
        if (view.paid) {
          clearInterval(interval);
          router.push(`/musica/${publicToken}`);
          router.refresh();
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 5000);

    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [pix, publicToken, router]);

  async function createPix() {
    // O gateway exige o CPF do pagador no PIX. Validar aqui evita uma ida à
    // rede só para voltar com recusa.
    if (!isValidCPF(cpf)) {
      setCpfError('Informe um CPF válido para gerar o PIX.');
      return;
    }

    setCpfError(null);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken,
          method: 'pix',
          identificationNumber: cpf.replace(/\D/g, ''),
        }),
      });

      const body = (await response.json()) as {
        pix?: PixData;
        message?: string;
      };

      if (!response.ok) {
        setError(body.message ?? 'Não conseguimos gerar o PIX agora.');
        return;
      }

      if (!body.pix?.qrCode) {
        setError('Não conseguimos gerar o código PIX agora. Tente novamente em instantes.');
        return;
      }

      setPix(body.pix);
      track('pix_created', {}, publicToken);
    } catch {
      setError('Não conseguimos gerar o PIX agora. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione o código manualmente.');
    }
  }

  if (!pix) {
    return (
      <div className="space-y-4">
        <label className="block">
          <span className="field-label">CPF</span>
          <input
            className="field-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            aria-invalid={cpfError ? true : undefined}
            onChange={(event) => {
              setCpf(formatCPF(event.target.value));
              setCpfError(null);
            }}
          />
          <span className="mt-1 block text-xs text-ink-soft">
            O banco pede o CPF de quem está pagando para liberar o PIX.
          </span>
          {cpfError ? <span className="field-error">{cpfError}</span> : null}
        </label>

        <button type="button" onClick={createPix} disabled={loading} className="btn-primary w-full">
          {loading ? 'Gerando PIX…' : `Pagar ${priceFormatted} com PIX`}
        </button>

        {error ? (
          <p role="alert" className="text-sm text-wine-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pix.qrCodeBase64 ? (
        <div className="flex justify-center">
          {/* QR devolvido pelo gateway em base64 — sem host externo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="QR Code do PIX"
            className="h-56 w-56 rounded-xl border border-cream-deep bg-white p-2"
          />
        </div>
      ) : null}

      <div>
        <p className="field-label">PIX copia e cola</p>
        <textarea
          readOnly
          value={pix.qrCode ?? ''}
          rows={3}
          className="field-input font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>

      <button type="button" onClick={copyCode} className="btn-ghost w-full">
        {copied ? 'Código copiado ✓' : 'Copiar código PIX'}
      </button>

      <p className="text-center text-sm text-ink-soft">
        Assim que o pagamento for confirmado, esta página avança sozinha.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-wine-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
