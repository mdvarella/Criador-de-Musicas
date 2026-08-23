import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/services/settings-service';
import type { OrderStatus } from '@/types/domain';

/**
 * Idempotência do webhook (itens 13 e 36 da especificação).
 *
 * Este é o teste mais importante do sistema: receber a MESMA notificação várias
 * vezes não pode gerar duas músicas nem duas cobranças confirmadas.
 *
 * As dependências são substituídas por fakes em memória que preservam a
 * semântica que importa — em especial a atualização condicional de status, que
 * é o que torna a aprovação idempotente.
 */

const SECRET = 'webhook-secret-de-teste';

type State = {
  order: {
    id: string;
    status: OrderStatus;
    amount_cents: number;
    paid_at: string | null;
    public_token: string;
    recipient_name: string;
    customer_id: string;
    currency: string;
    delivery_token: string | null;
  };
  payment: {
    id: string;
    order_id: string;
    provider: string;
    provider_payment_id: string;
    status: string;
    method: string | null;
    amount_cents: number;
    approved_at: string | null;
  };
  webhookEvents: Map<string, { id: string; processed: boolean }>;
  jobs: Array<{ type: string; dedupe_key: string | null; order_id: string | null }>;
  orderEvents: string[];
  gatewayAmountCents: number;
};

let state: State;

function freshState(): State {
  return {
    order: {
      id: 'order-1',
      status: 'AWAITING_PAYMENT',
      amount_cents: 4990,
      paid_at: null,
      public_token: 'tok_publico',
      recipient_name: 'Marina',
      customer_id: 'cust-1',
      currency: 'BRL',
      delivery_token: null,
    },
    payment: {
      id: 'pay-row-1',
      order_id: 'order-1',
      provider: 'mercadopago',
      provider_payment_id: '12345',
      status: 'PENDING',
      method: 'pix',
      amount_cents: 4990,
      approved_at: null,
    },
    webhookEvents: new Map(),
    jobs: [],
    orderEvents: [],
    gatewayAmountCents: 4990,
  };
}

vi.mock('@/services/settings-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings-service')>(
    '@/services/settings-service',
  );
  return { ...actual, getSettings: async () => actual.DEFAULT_SETTINGS };
});

vi.mock('@/services/analytics-service', () => ({ trackServerEvent: async () => {} }));

vi.mock('@/repositories/event-repository', () => ({
  recordOrderEvent: async (input: { eventType: string }) => {
    state.orderEvents.push(input.eventType);
  },
}));

vi.mock('@/repositories/customer-repository', () => ({
  findCustomerById: async () => ({
    id: 'cust-1',
    name: 'Rafael',
    email: 'rafael@exemplo.com.br',
    phone: '5519999991234',
  }),
}));

vi.mock('@/repositories/webhook-repository', () => ({
  // Reproduz a restrição de unicidade sobre (provider, event_key).
  claimWebhookEvent: async (input: { eventKey: string }) => {
    if (state.webhookEvents.has(input.eventKey)) {
      return { claimed: false, reason: 'duplicate', existing: null };
    }
    const event = { id: `evt-${state.webhookEvents.size + 1}`, processed: false };
    state.webhookEvents.set(input.eventKey, event);
    return { claimed: true, event };
  },
  markWebhookProcessed: async () => {},
  releaseWebhookEvent: async (id: string) => {
    for (const [key, value] of state.webhookEvents) {
      if (value.id === id) state.webhookEvents.delete(key);
    }
  },
}));

vi.mock('@/repositories/payment-repository', () => ({
  findPaymentByProviderId: async () => state.payment,
  updatePayment: async (_id: string, patch: Record<string, unknown>) => {
    Object.assign(state.payment, patch);
    return state.payment;
  },
  upsertPayment: async () => state.payment,
  findLatestPendingPayment: async () => null,
}));

vi.mock('@/repositories/order-repository', () => ({
  findOrderById: async () => state.order,
  findOrderByPublicToken: async () => state.order,
  // Semântica de `update ... where status in (...)`: sem linha afetada, devolve null.
  updateOrderStatusIfIn: async (
    _id: string,
    expected: OrderStatus[],
    patch: Record<string, unknown> & { status: OrderStatus },
  ) => {
    if (!expected.includes(state.order.status)) return null;
    Object.assign(state.order, patch);
    return { ...state.order };
  },
}));

vi.mock('@/repositories/job-repository', () => ({
  // Reproduz o índice único parcial sobre dedupe_key de jobs vivos.
  enqueueJob: async (input: { type: string; dedupeKey?: string; orderId?: string }) => {
    if (input.dedupeKey && state.jobs.some((job) => job.dedupe_key === input.dedupeKey)) {
      return null;
    }
    const job = {
      type: input.type,
      dedupe_key: input.dedupeKey ?? null,
      order_id: input.orderId ?? null,
    };
    state.jobs.push(job);
    return job;
  },
}));

vi.mock('@/providers/payment', () => ({
  getPaymentProvider: async () => {
    const { MercadoPagoProvider } = await import('@/providers/payment/mercadopago-provider');
    const provider = new MercadoPagoProvider();

    // A consulta ao gateway é a fonte da verdade; aqui ela é determinística.
    provider.getPayment = async () => ({
      providerPaymentId: '12345',
      status: 'APPROVED' as const,
      rawStatus: 'approved',
      statusDetail: 'accredited',
      method: 'pix',
      amountCents: state.gatewayAmountCents,
      approvedAt: '2026-08-22T12:00:00.000Z',
      liveMode: false,
    });

    return provider;
  },
}));

const { handleMercadoPagoWebhook } = await import('@/services/payment-service');

function buildNotification(dataId = '12345', requestId = 'req-1') {
  const ts = '1700000000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');

  return {
    headers: new Headers({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId }),
    url: new URL(`https://exemplo.com.br/api/webhooks/mercadopago?type=payment&data.id=${dataId}`),
    rawBody: JSON.stringify({ action: 'payment.updated', data: { id: dataId } }),
    requestId,
  };
}

describe('webhook de pagamento', () => {
  beforeEach(() => {
    state = freshState();
  });

  it('confirma o pagamento e enfileira a música completa uma única vez', async () => {
    const first = await handleMercadoPagoWebhook(buildNotification());

    expect(first.status).toBe(200);
    expect(state.order.status).toBe('FULL_SONG_QUEUED');
    expect(state.order.paid_at).toBe('2026-08-22T12:00:00.000Z');
    expect(state.jobs.filter((job) => job.type === 'GENERATE_FULL_SONG')).toHaveLength(1);
  });

  it('descarta reentregas do mesmo evento sem gerar nada a mais', async () => {
    await handleMercadoPagoWebhook(buildNotification());
    const second = await handleMercadoPagoWebhook(buildNotification('12345', 'req-2'));
    const third = await handleMercadoPagoWebhook(buildNotification('12345', 'req-3'));

    expect(second.body).toMatchObject({ duplicate: true });
    expect(third.body).toMatchObject({ duplicate: true });

    expect(state.jobs.filter((job) => job.type === 'GENERATE_FULL_SONG')).toHaveLength(1);
    expect(state.orderEvents.filter((event) => event === 'payment_approved')).toHaveLength(1);
  });

  it('não gera segunda música mesmo se o evento chegar com outra chave', async () => {
    await handleMercadoPagoWebhook(buildNotification());

    // Simula uma notificação distinta para o MESMO pagamento já aplicado.
    state.webhookEvents.clear();
    await handleMercadoPagoWebhook(buildNotification());

    // A transição condicional recusa: o pedido já saiu de AWAITING_PAYMENT.
    expect(state.jobs.filter((job) => job.type === 'GENERATE_FULL_SONG')).toHaveLength(1);
    expect(state.orderEvents.filter((event) => event === 'payment_approved')).toHaveLength(1);
  });

  it('recusa notificação com assinatura inválida sem tocar no pedido', async () => {
    const notification = buildNotification();
    notification.headers.set('x-signature', 'ts=1700000000,v1=falsificado');

    const result = await handleMercadoPagoWebhook(notification);

    expect(result.status).toBe(401);
    expect(state.order.status).toBe('AWAITING_PAYMENT');
    expect(state.order.paid_at).toBeNull();
    expect(state.jobs).toHaveLength(0);
  });

  it('não aprova quando o valor do gateway diverge do valor do pedido', async () => {
    state.gatewayAmountCents = 100; // alguém pagou R$ 1,00 em um pedido de R$ 49,90

    const result = await handleMercadoPagoWebhook(buildNotification());

    expect(result.status).toBe(200);
    expect(state.order.status).toBe('AWAITING_PAYMENT');
    expect(state.order.paid_at).toBeNull();
    expect(state.jobs).toHaveLength(0);
    expect(state.orderEvents).toContain('payment_amount_mismatch');
  });

  it('ignora notificações que não são de pagamento', async () => {
    const notification = buildNotification();
    notification.url.searchParams.set('type', 'merchant_order');

    const result = await handleMercadoPagoWebhook(notification);

    expect(result.status).toBe(200);
    expect(state.order.status).toBe('AWAITING_PAYMENT');
    expect(state.jobs).toHaveLength(0);
  });

  it('mantém os defaults de configuração usados no fluxo', () => {
    expect(DEFAULT_SETTINGS.max_generation_attempts).toBeGreaterThan(0);
  });

  /**
   * Cenário de recuperação: o pedido já avançou para FULL_SONG_QUEUED mas o job
   * não existe — o que acontece se o enfileiramento falhar por algo transitório
   * logo depois da transição. Antes da correção, a reentrega do webhook não
   * encontrava linha para transicionar e o job nunca era criado: cliente pago,
   * pedido travado, sem recuperação automática.
   */
  it('cria o job na reentrega quando o pedido ficou em FULL_SONG_QUEUED sem job', async () => {
    state.order.status = 'FULL_SONG_QUEUED';
    state.order.paid_at = '2026-08-22T12:00:00.000Z';
    expect(state.jobs).toHaveLength(0);

    await handleMercadoPagoWebhook(buildNotification('12345', 'req-recuperacao'));

    expect(state.jobs.filter((job) => job.type === 'GENERATE_FULL_SONG')).toHaveLength(1);
  });

  it('e não cria um segundo job quando já existe um vivo', async () => {
    await handleMercadoPagoWebhook(buildNotification());
    state.webhookEvents.clear();

    await handleMercadoPagoWebhook(buildNotification('12345', 'req-outra'));

    expect(state.jobs.filter((job) => job.type === 'GENERATE_FULL_SONG')).toHaveLength(1);
  });
});
