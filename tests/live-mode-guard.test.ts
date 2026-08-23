import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvCache } from '@/lib/env';
import { MercadoPagoProvider } from '@/providers/payment/mercadopago-provider';

/**
 * Trava contra credencial de produção durante a fase de testes.
 *
 * Um token de produção colado no ambiente por engano cobraria de uma pessoa
 * real. Não existe `git revert` para isso — a única defesa é recusar antes.
 */

function stubGateway(payment: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payment), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

const approvedTestPayment = {
  id: 12345,
  live_mode: false,
  status: 'approved',
  status_detail: 'accredited',
  payment_method_id: 'pix',
  transaction_amount: 49.9,
  date_approved: '2026-08-23T12:00:00.000Z',
};

beforeEach(() => {
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'token-de-teste';
  process.env.MERCADO_PAGO_ALLOW_LIVE = 'false';
  resetServerEnvCache();
});

describe('pagamento com dinheiro real', () => {
  it('é RECUSADO enquanto a trava não é liberada', async () => {
    stubGateway({ ...approvedTestPayment, live_mode: true });

    const provider = new MercadoPagoProvider();

    await expect(provider.getPayment('12345')).rejects.toThrow(/live_mode=true/);
  });

  it('a recusa não é reprocessável: insistir não resolveria', async () => {
    stubGateway({ ...approvedTestPayment, live_mode: true });

    const provider = new MercadoPagoProvider();

    await expect(provider.getPayment('12345')).rejects.toMatchObject({ retryable: false });
  });

  it('a mensagem diz o que fazer, nos dois cenários possíveis', async () => {
    stubGateway({ ...approvedTestPayment, live_mode: true });

    try {
      await new MercadoPagoProvider().getPayment('12345');
      expect.unreachable('deveria ter recusado');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('troque-as');
      expect(message).toContain('MERCADO_PAGO_ALLOW_LIVE=true');
    }
  });

  it('passa quando a trava é liberada de propósito', async () => {
    process.env.MERCADO_PAGO_ALLOW_LIVE = 'true';
    resetServerEnvCache();
    stubGateway({ ...approvedTestPayment, live_mode: true });

    const result = await new MercadoPagoProvider().getPayment('12345');

    expect(result.status).toBe('APPROVED');
    expect(result.liveMode).toBe(true);
  });
});

describe('pagamento de teste', () => {
  it('passa normalmente com a trava ligada', async () => {
    stubGateway(approvedTestPayment);

    const result = await new MercadoPagoProvider().getPayment('12345');

    expect(result.status).toBe('APPROVED');
    expect(result.liveMode).toBe(false);
    expect(result.amountCents).toBe(4990);
  });

  it('gateway que não informa live_mode não é bloqueado', async () => {
    const { live_mode, ...withoutFlag } = approvedTestPayment;
    void live_mode;
    stubGateway(withoutFlag);

    const result = await new MercadoPagoProvider().getPayment('12345');

    expect(result.liveMode).toBeNull();
  });
});
