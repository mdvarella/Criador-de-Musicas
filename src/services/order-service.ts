import 'server-only';
import { AppError } from '@/lib/errors';
import { generateToken } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { normalizePhoneBR } from '@/lib/format';
import { enqueueJob } from '@/repositories/job-repository';
import { insertOrder, updateOrderStatusIfIn, type CreateOrderRow } from '@/repositories/order-repository';
import { insertSongRequest } from '@/repositories/song-request-repository';
import { recordOrderEvent } from '@/repositories/event-repository';
import { saveAttribution } from '@/repositories/attribution-repository';
import { upsertCustomer } from '@/repositories/customer-repository';
import type { CreateOrderInput } from '@/schemas/song-form';
import type { OrderRow } from '@/types/database';
import type { Json, OrderStatus, Plan } from '@/types/domain';
import { trackServerEvent } from './analytics-service';
import { getSettings } from './settings-service';
import { canTransition } from './order-status';
import { quotePrice } from './pricing-service';

/**
 * Criação do pedido — o momento em que uma história vira uma linha no banco.
 *
 * Ordem intencional: cliente, pedido, história, atribuição, evento, job. Se
 * algo falhar depois do pedido criado, ele fica visível no painel em vez de
 * sumir, e o job pode ser reenfileirado.
 */
export async function createOrder(
  input: CreateOrderInput,
  meta: { requestId: string; plan?: Plan; isSeed?: boolean },
): Promise<{ order: OrderRow; publicToken: string }> {
  const settings = await getSettings();

  if (settings.maintenance_mode && !meta.isSeed) {
    throw new AppError('MAINTENANCE', 'modo manutenção ativo');
  }

  const plan = meta.plan ?? 'STANDARD';
  const quote = await quotePrice(plan);
  const now = new Date().toISOString();

  const customer = await upsertCustomer({
    name: input.customer.firstName,
    email: input.customer.email,
    phone: normalizePhoneBR(input.customer.whatsapp),
    acceptedTermsAt: now,
    acceptedPrivacyAt: now,
    marketingOptIn: input.customer.marketingOptIn,
  });

  const publicToken = generateToken();

  const orderInput: CreateOrderRow = {
    customerId: customer.id,
    publicToken,
    occasion: resolveOther(input.song.occasion, input.song.occasionOther),
    recipientName: input.song.recipientName,
    relationship: resolveOther(input.song.relationship, input.song.relationshipOther),
    musicStyle: input.song.musicStyle,
    voicePreference: input.song.voicePreference,
    emotionalTone: input.song.emotionalTone,
    amountCents: quote.amountCents,
    plan: quote.plan,
    isSeed: meta.isSeed ?? false,
  };

  const order = await insertOrder(orderInput);

  await insertSongRequest({
    orderId: order.id,
    originalStory: input.song.story,
    specialDetails: input.song.specialDetails as unknown as Record<string, Json>,
    mandatoryPhrase: input.song.mandatoryPhrase,
  });

  await saveAttribution({ orderId: order.id, ...input.attribution });

  await recordOrderEvent({
    orderId: order.id,
    eventType: 'order_created',
    message: `Pedido criado para ${order.recipient_name}`,
    metadata: {
      plan: quote.plan,
      amount_cents: quote.amountCents,
      music_style: order.music_style,
      request_id: meta.requestId,
    },
  });

  await trackServerEvent({
    eventName: 'story_submitted',
    orderId: order.id,
    anonymousId: input.anonymousId ?? null,
    properties: { occasion: order.occasion, music_style: order.music_style },
    utm: input.attribution as unknown as Record<string, Json>,
  });

  // A história é processada fora do ciclo da requisição: o cliente já pode ver
  // a tela de acompanhamento enquanto o job roda.
  await enqueueJob({
    type: 'PROCESS_STORY',
    orderId: order.id,
    dedupeKey: `process-story:${order.id}`,
    payload: { request_id: meta.requestId },
  });

  logger.info('order.created', {
    order_id: order.id,
    request_id: meta.requestId,
    public_token: publicToken,
    amount_cents: quote.amountCents,
  });

  return { order, publicToken };
}

/** "Outra" é uma opção de catálogo; o texto livre do cliente entra como sufixo. */
function resolveOther(value: string, other?: string): string {
  if (!other?.trim()) return value;
  if (!value.startsWith('OUTR')) return value;
  return `${value}: ${other.trim().slice(0, 60)}`;
}

/**
 * Avança o status do pedido respeitando a máquina de estados.
 *
 * A transição é condicional no banco (`updateOrderStatusIfIn`), então duas
 * execuções simultâneas não conseguem aplicar a mesma mudança duas vezes.
 * Devolve null quando a transição não era válida — e isso é esperado, não erro.
 */
export async function advanceOrderStatus(
  order: Pick<OrderRow, 'id' | 'status'>,
  to: OrderStatus,
  options: { message?: string; metadata?: Record<string, Json>; patch?: Partial<OrderRow> } = {},
): Promise<OrderRow | null> {
  if (!canTransition(order.status, to)) {
    logger.warn('order.invalid_transition', {
      order_id: order.id,
      from: order.status,
      to,
    });
    return null;
  }

  const from = order.status;

  // A cláusula `in (from)` é o que torna a transição atômica: se outro processo
  // já mudou o status, este update não encontra linha e devolve null.
  const updated = await updateOrderStatusIfIn(order.id, [from], {
    ...options.patch,
    status: to,
  });

  if (!updated) {
    logger.info('order.transition_skipped', { order_id: order.id, from, to });
    return null;
  }

  await recordOrderEvent({
    orderId: order.id,
    eventType: `status_${to.toLowerCase()}`,
    message: options.message ?? `Status alterado de ${from} para ${to}`,
    metadata: { from, to, ...options.metadata },
  });

  return updated;
}
