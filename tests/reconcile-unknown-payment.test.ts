import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Notificação sobre um pagamento que não é nosso.
 *
 * Acontece de verdade com o simulador de notificações do painel do gateway, que
 * envia um id fictício. A resposta certa é ignorar em silêncio — não sair
 * consultando o gateway por um id que não conhecemos, o que retornaria 404 e
 * faria o simulador acusar erro na integração.
 */

let knownPayment: unknown = null;
const getPayment = vi.fn();

vi.mock('@/services/settings-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings-service')>(
    '@/services/settings-service',
  );
  return { ...actual, getSettings: async () => actual.DEFAULT_SETTINGS };
});

vi.mock('@/services/analytics-service', () => ({ trackServerEvent: async () => {} }));
vi.mock('@/repositories/event-repository', () => ({ recordOrderEvent: async () => {} }));
vi.mock('@/repositories/job-repository', () => ({ enqueueJob: async () => null }));
vi.mock('@/repositories/customer-repository', () => ({ findCustomerById: async () => null }));

vi.mock('@/repositories/payment-repository', () => ({
  findPaymentByProviderId: async () => knownPayment,
  updatePayment: async () => ({}),
  upsertPayment: async () => ({}),
  findLatestPendingPayment: async () => null,
}));

vi.mock('@/repositories/order-repository', () => ({
  findOrderById: async () => ({ id: 'order-1', status: 'AWAITING_PAYMENT', amount_cents: 4990 }),
  findOrderByPublicToken: async () => null,
  updateOrderStatusIfIn: async () => null,
}));

vi.mock('@/providers/payment', () => ({
  getPaymentProvider: async () => ({ name: 'mercadopago', getPayment }),
}));

const { reconcilePayment } = await import('@/services/payment-service');

beforeEach(() => {
  knownPayment = null;
  getPayment.mockReset();
  getPayment.mockRejectedValue(new Error('404 — o gateway não conhece este pagamento'));
});

describe('conciliação de pagamento desconhecido', () => {
  it('não consulta o gateway quando não conhecemos o pagamento', async () => {
    await expect(reconcilePayment('mercadopago', 'id-ficticio-do-simulador')).resolves.toBeUndefined();

    expect(getPayment).not.toHaveBeenCalled();
  });

  it('consulta o gateway quando o pagamento é nosso', async () => {
    knownPayment = {
      id: 'pay-1',
      order_id: 'order-1',
      provider: 'mercadopago',
      provider_payment_id: '12345',
      status: 'PENDING',
      method: 'pix',
      amount_cents: 4990,
      approved_at: null,
    };

    getPayment.mockResolvedValue({
      providerPaymentId: '12345',
      status: 'PENDING',
      rawStatus: 'pending',
      statusDetail: null,
      method: 'pix',
      amountCents: 4990,
      approvedAt: null,
    });

    await reconcilePayment('mercadopago', '12345');

    expect(getPayment).toHaveBeenCalledWith('12345');
  });
});
