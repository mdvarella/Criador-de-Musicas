import 'server-only';
import { AppError } from '@/lib/errors';
import { generateIdempotencyKey } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { absoluteUrl } from '@/lib/brand';
import { getPaymentProvider, type PaymentMethodKind, type PaymentResult } from '@/providers/payment';
import { findCustomerById } from '@/repositories/customer-repository';
import { recordOrderEvent } from '@/repositories/event-repository';
import { enqueueJob } from '@/repositories/job-repository';
import {
  findOrderById,
  findOrderByPublicToken,
  updateOrderStatusIfIn,
} from '@/repositories/order-repository';
import {
  findLatestPendingPayment,
  findPaymentByProviderId,
  updatePayment,
  upsertPayment,
} from '@/repositories/payment-repository';
import {
  claimWebhookEvent,
  markWebhookProcessed,
  releaseWebhookEvent,
} from '@/repositories/webhook-repository';
import type { OrderRow, PaymentRow } from '@/types/database';
import type { Json, OrderStatus } from '@/types/domain';
import { trackServerEvent } from './analytics-service';
import { isPaid, statusesThatCanBecome } from './order-status';
import { assertChargeableAmount } from './pricing-service';
import { getSettings } from './settings-service';

/**
 * Pagamentos (Fases 6 e 7).
 *
 * Regras que este arquivo existe para garantir:
 *   - o valor cobrado vem do pedido no banco, nunca do frontend;
 *   - o webhook apenas AVISA; a verdade é o GET no gateway;
 *   - o mesmo evento entregue N vezes gera no máximo uma cobrança confirmada e
 *     uma única geração de música completa.
 */

export type CheckoutInput = {
  publicToken: string;
  method: PaymentMethodKind;
  /** Token do cartão gerado no browser. O servidor nunca vê o número do cartão. */
  cardToken?: string;
  installments?: number;
  paymentMethodId?: string;
  issuerId?: string;
  identificationNumber?: string;
};

export type CheckoutResult = {
  paymentId: string;
  status: PaymentRow['status'];
  method: string | null;
  amountCents: number;
  pix?: { qrCode: string | null; qrCodeBase64: string | null; expiresAt: string | null };
};

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const order = await findOrderByPublicToken(input.publicToken);
  if (!order) throw new AppError('NOT_FOUND', 'pedido não encontrado para checkout');

  if (order.paid_at) {
    throw new AppError('CONFLICT', `pedido ${order.id} já está pago`, {
      userMessage: 'Este pedido já foi pago. Confira o link da sua música.',
    });
  }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new AppError('CONFLICT', `pedido ${order.id} não pode mais ser pago`);
  }

  const settings = await getSettings();
  if (!settings.payment_methods.includes(input.method)) {
    throw new AppError('VALIDATION_ERROR', `meio de pagamento ${input.method} não habilitado`);
  }

  // Preço: exclusivamente o que está gravado no pedido.
  assertChargeableAmount(order.amount_cents);

  const customer = await findCustomerById(order.customer_id);
  if (!customer) throw new AppError('NOT_FOUND', `cliente do pedido ${order.id} não existe`);

  // PIX pendente ainda válido é reaproveitado em vez de gerar outro QR code.
  if (input.method === 'pix') {
    const pending = await findLatestPendingPayment(order.id);
    if (pending && pending.method === 'pix' && isPixStillValid(pending)) {
      return toCheckoutResult(pending);
    }
  }

  const provider = await getPaymentProvider();

  const result = await provider.createPayment({
    orderId: order.id,
    externalReference: order.public_token,
    amountCents: order.amount_cents,
    currency: order.currency,
    description: `Música personalizada para ${order.recipient_name}`,
    method: input.method,
    payer: {
      firstName: customer.name,
      // O gateway exige um e-mail no pagador, mas o cliente pode não ter um.
      // Nesses casos usamos um endereço do NOSSO domínio, único por pedido:
      // é um identificador válido, rastreável no painel e que não finge ser
      // um contato do cliente.
      email: customer.email ?? fallbackPayerEmail(order.public_token),
      phone: customer.phone,
      identificationNumber: input.identificationNumber,
    },
    idempotencyKey: generateIdempotencyKey(),
    notificationUrl: absoluteUrl('/api/webhooks/mercadopago'),
    cardToken: input.cardToken,
    installments: input.installments,
    paymentMethodId: input.paymentMethodId,
    issuerId: input.issuerId,
  });

  const payment = await upsertPayment({
    orderId: order.id,
    provider: provider.name,
    providerPaymentId: result.providerPaymentId,
    method: result.method ?? input.method,
    status: result.status,
    rawStatus: result.rawStatus,
    statusDetail: result.statusDetail,
    amountCents: order.amount_cents,
    currency: order.currency,
    pixQrCode: result.pix?.qrCode ?? null,
    pixQrCodeBase64: result.pix?.qrCodeBase64 ?? null,
    pixExpiresAt: result.pix?.expiresAt ?? null,
    approvedAt: result.approvedAt,
  });

  await updateOrderStatusIfIn(order.id, ['PREVIEW_READY', 'STORY_PROCESSED', 'AWAITING_PAYMENT'], {
    status: 'AWAITING_PAYMENT',
  });

  await recordOrderEvent({
    orderId: order.id,
    eventType: 'checkout_created',
    message: `Pagamento iniciado via ${input.method}`,
    metadata: { payment_id: payment.provider_payment_id, method: input.method },
  });

  await trackServerEvent({
    eventName: input.method === 'pix' ? 'pix_created' : 'card_payment_started',
    orderId: order.id,
    properties: { amount_cents: order.amount_cents },
  });

  // Cartão pode voltar aprovado na hora; conciliamos imediatamente.
  if (result.status === 'APPROVED') {
    await reconcilePayment(provider.name, result.providerPaymentId, result);
  }

  return toCheckoutResult(payment);
}

/**
 * Processa uma notificação do gateway.
 *
 * Ordem obrigatória: valida assinatura → reserva o evento (idempotência) →
 * consulta o gateway → concilia. Um evento sem assinatura válida é registrado
 * e descartado, nunca aplicado.
 */
export async function handleMercadoPagoWebhook(args: {
  headers: Headers;
  url: URL;
  rawBody: string;
  requestId: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const provider = await getPaymentProvider();
  const verification = provider.verifyWebhook(args);

  let payload: Json = {};
  try {
    payload = args.rawBody ? (JSON.parse(args.rawBody) as Json) : {};
  } catch {
    payload = { raw: args.rawBody.slice(0, 1000) };
  }

  if (!verification.valid) {
    logger.warn('webhook.invalid_signature', {
      request_id: args.requestId,
      reason: verification.reason,
      event_key: verification.eventKey,
    });
    // 401 sem detalhe: não damos pistas a quem tenta forjar notificação.
    return { status: 401, body: { received: false } };
  }

  if (!verification.resourceId) {
    return { status: 200, body: { received: true, ignored: 'sem data.id' } };
  }

  // Só nos interessam eventos de pagamento.
  if (verification.eventType && !verification.eventType.includes('payment')) {
    return { status: 200, body: { received: true, ignored: verification.eventType } };
  }

  const claim = await claimWebhookEvent({
    provider: provider.name,
    eventKey: verification.eventKey,
    eventType: verification.eventType,
    signatureValid: true,
    payload,
  });

  if (!claim.claimed) {
    logger.info('webhook.duplicate_ignored', {
      request_id: args.requestId,
      event_key: verification.eventKey,
    });
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    await reconcilePayment(provider.name, verification.resourceId);
    await markWebhookProcessed(claim.event.id);
    return { status: 200, body: { received: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('webhook.processing_failed', {
      request_id: args.requestId,
      event_key: verification.eventKey,
      error: message,
    });

    // Libera o registro para que a reentrega do gateway possa tentar de novo.
    await releaseWebhookEvent(claim.event.id, message);

    // 500 faz o gateway reentregar; é o comportamento que queremos.
    return { status: 500, body: { received: false } };
  }
}

/**
 * Concilia um pagamento com a verdade do gateway.
 *
 * `known` existe apenas para evitar um GET redundante logo após o POST de
 * criação; em qualquer outro caminho consultamos o gateway.
 */
export async function reconcilePayment(
  providerName: string,
  providerPaymentId: string,
  known?: PaymentResult,
): Promise<void> {
  // Verificamos NOSSO registro primeiro, e só então consultamos o gateway.
  // Além de economizar uma chamada, é o que faz o simulador de notificações do
  // painel funcionar: ele envia um id fictício, que não conhecemos, e a
  // resposta correta é ignorar em silêncio — não estourar um 404 do gateway.
  const existing = await findPaymentByProviderId(providerName, providerPaymentId);
  if (!existing) {
    logger.warn('payment.unknown_reference', { payment_id: providerPaymentId });
    return;
  }

  const provider = await getPaymentProvider();
  const fresh = known ?? (await provider.getPayment(providerPaymentId));

  const order = await findOrderById(existing.order_id);
  if (!order) {
    logger.warn('payment.order_missing', { payment_id: providerPaymentId });
    return;
  }

  await updatePayment(existing.id, {
    status: fresh.status,
    raw_status: fresh.rawStatus,
    status_detail: fresh.statusDetail,
    method: fresh.method ?? existing.method,
    approved_at: fresh.approvedAt ?? existing.approved_at,
  });

  await recordOrderEvent({
    orderId: order.id,
    eventType: 'payment_status_changed',
    message: `Pagamento passou a ${fresh.status}`,
    metadata: {
      payment_id: providerPaymentId,
      status: fresh.status,
      raw_status: fresh.rawStatus,
    },
  });

  if (fresh.status === 'APPROVED') {
    await applyApprovedPayment(order, existing, fresh);
    return;
  }

  if (fresh.status === 'REFUNDED' || fresh.status === 'CHARGED_BACK') {
    await updateOrderStatusIfIn(order.id, [order.status], { status: 'REFUNDED' });
    return;
  }

  if (fresh.status === 'IN_PROCESS') {
    await updateOrderStatusIfIn(order.id, ['AWAITING_PAYMENT'], { status: 'PAYMENT_PROCESSING' });
  }
}

/**
 * Aplica a aprovação uma única vez.
 *
 * A transição condicional é o coração da idempotência: apenas o processo que
 * conseguir mover o pedido para PAID enfileira a geração completa. Qualquer
 * reentrega posterior encontra o pedido já pago e não faz nada.
 */
async function applyApprovedPayment(
  order: OrderRow,
  payment: PaymentRow,
  fresh: PaymentResult,
): Promise<void> {
  // Confere que o valor aprovado é o valor do pedido.
  if (fresh.amountCents !== order.amount_cents) {
    logger.error('payment.amount_mismatch', {
      order_id: order.id,
      payment_id: payment.provider_payment_id,
      expected_cents: order.amount_cents,
      received_cents: fresh.amountCents,
    });
    await recordOrderEvent({
      orderId: order.id,
      eventType: 'payment_amount_mismatch',
      message: 'Valor aprovado diferente do valor do pedido',
      metadata: { expected: order.amount_cents, received: fresh.amountCents },
    });
    return;
  }

  // Derivado da máquina de estados, não escrito à mão: qualquer estado que
  // possa virar PAID entra aqui automaticamente. Os que já contam como pagos
  // saem, e é isso que impede a aprovação de ser aplicada duas vezes.
  const eligible: OrderStatus[] = statusesThatCanBecome('PAID').filter(
    (status) => !isPaid(status),
  );

  const paidOrder = await updateOrderStatusIfIn(order.id, eligible, {
    status: 'PAID',
    paid_at: fresh.approvedAt ?? new Date().toISOString(),
  });

  if (!paidOrder) {
    logger.info('payment.already_applied', {
      order_id: order.id,
      payment_id: payment.provider_payment_id,
    });

    // Aprovação já aplicada — mas isso NÃO significa que a geração foi
    // enfileirada. Se o enqueue falhou por algo transitório logo depois da
    // transição, o pedido ficou em FULL_SONG_QUEUED sem job, e esta reentrega é
    // a única chance de recuperar. Cliente pago sem música é o pior desfecho
    // possível, então checamos sempre.
    await ensureFullSongQueued(order.id);
    return;
  }

  await recordOrderEvent({
    orderId: order.id,
    eventType: 'payment_approved',
    message: 'Pagamento aprovado',
    metadata: { payment_id: payment.provider_payment_id, amount_cents: fresh.amountCents },
  });

  await trackServerEvent({
    eventName: 'payment_approved',
    orderId: order.id,
    properties: { amount_cents: fresh.amountCents, method: fresh.method ?? 'unknown' },
  });

  await updateOrderStatusIfIn(order.id, ['PAID'], { status: 'FULL_SONG_QUEUED' });
  await ensureFullSongQueued(order.id);

  await enqueueJob({
    type: 'SEND_NOTIFICATION',
    orderId: order.id,
    dedupeKey: `notify:payment_approved:${order.id}`,
    payload: { event_type: 'payment_approved' },
  });
}

/**
 * Garante que existe um job de música completa para o pedido.
 *
 * Idempotente por construção e chamada nos DOIS caminhos: quando a aprovação
 * acaba de ser aplicada e quando ela já havia sido. A separação existe porque
 * transição de status e enfileiramento são duas escritas distintas — a segunda
 * pode falhar sozinha, e sem esta função o pedido ficaria pago e parado.
 *
 * Enfileirar sem ser quem fez a transição é seguro: a chave de deduplicação
 * garante um job vivo por pedido, e `generateFullSong` ainda checa pagamento,
 * transição de entrada e geração viva antes de gastar qualquer crédito.
 */
async function ensureFullSongQueued(orderId: string): Promise<void> {
  const order = await findOrderById(orderId);
  if (order?.status !== 'FULL_SONG_QUEUED') return;

  const settings = await getSettings();

  await enqueueJob({
    type: 'GENERATE_FULL_SONG',
    orderId,
    dedupeKey: `generate-full:${orderId}`,
    maxAttempts: settings.max_generation_attempts,
  });
}

/** Endereço técnico por pedido, para quando o cliente não informa e-mail. */
function fallbackPayerEmail(publicToken: string): string {
  const domain = new URL(absoluteUrl('/')).hostname.replace(/^www\./, '');
  return `pedido-${publicToken}@${domain}`;
}

function isPixStillValid(payment: PaymentRow): boolean {
  if (!payment.pix_qr_code) return false;
  if (!payment.pix_expires_at) return true;
  return new Date(payment.pix_expires_at).getTime() > Date.now() + 60_000;
}

function toCheckoutResult(payment: PaymentRow): CheckoutResult {
  return {
    paymentId: payment.provider_payment_id,
    status: payment.status,
    method: payment.method,
    amountCents: payment.amount_cents,
    ...(payment.pix_qr_code
      ? {
          pix: {
            qrCode: payment.pix_qr_code,
            qrCodeBase64: payment.pix_qr_code_base64,
            expiresAt: payment.pix_expires_at,
          },
        }
      : {}),
  };
}
