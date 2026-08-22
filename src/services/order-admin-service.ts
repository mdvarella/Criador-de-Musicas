import 'server-only';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { findCustomerById } from '@/repositories/customer-repository';
import { listGenerationsByOrder, cancelAliveGenerations } from '@/repositories/generation-repository';
import { listNotificationEvents, listOrderEvents, recordOrderEvent } from '@/repositories/event-repository';
import { enqueueJob, listJobsByOrder } from '@/repositories/job-repository';
import {
  findCustomerIdsByTerm,
  findOrderById,
  listOrders,
  listOrdersByCustomerIds,
  updateOrder,
  updateOrderStatusIfIn,
  type OrderListFilters,
  type OrderListItem,
} from '@/repositories/order-repository';
import { findAttribution } from '@/repositories/attribution-repository';
import { listPaymentsByOrder } from '@/repositories/payment-repository';
import { findSongRequestByOrderId } from '@/repositories/song-request-repository';
import { mediaUrl } from '@/lib/signing';
import type { OrderStatus } from '@/types/domain';
import { getSettings } from './settings-service';
import { statusesThatCanBecome } from './order-status';

/**
 * Consultas e ações do painel.
 *
 * Tudo aqui pressupõe que `requireAdmin()` já rodou na página — este módulo não
 * é montado em nenhuma rota pública.
 */

export async function searchOrders(
  filters: OrderListFilters,
): Promise<{ items: OrderListItem[]; total: number }> {
  // Busca por dados do cliente (nome, e-mail, WhatsApp) exige resolver os
  // clientes primeiro, porque o filtro do Postgrest não atravessa a relação.
  if (filters.search && !looksLikeOrderReference(filters.search)) {
    const customerIds = await findCustomerIdsByTerm(filters.search);
    if (customerIds.length > 0) {
      const byCustomer = await listOrdersByCustomerIds(customerIds, filters.limit ?? 25);
      if (byCustomer.length > 0) return { items: byCustomer, total: byCustomer.length };
    }
  }

  return listOrders(filters);
}

function looksLikeOrderReference(term: string): boolean {
  return /^[0-9a-f-]{20,}$/i.test(term.trim());
}

export type OrderDetail = Awaited<ReturnType<typeof getOrderDetail>>;

export async function getOrderDetail(orderId: string) {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', `pedido ${orderId} não existe`);

  const [customer, songRequest, generations, payments, events, notifications, jobs, attribution] =
    await Promise.all([
      findCustomerById(order.customer_id),
      findSongRequestByOrderId(orderId),
      listGenerationsByOrder(orderId),
      listPaymentsByOrder(orderId),
      listOrderEvents(orderId),
      listNotificationEvents(orderId),
      listJobsByOrder(orderId),
      findAttribution(orderId),
    ]);

  // URLs de áudio para o painel são assinadas e curtas, como as do cliente.
  const generationsWithAudio = generations.map((generation) => ({
    ...generation,
    audioUrl:
      generation.status === 'READY' && generation.storage_path
        ? mediaUrl(generation.id, generation.type === 'PREVIEW' ? 'preview' : 'full', 60 * 15)
        : null,
  }));

  return {
    order,
    customer,
    songRequest,
    generations: generationsWithAudio,
    payments,
    events,
    notifications,
    jobs,
    attribution,
  };
}

/* -------------------------------------------------------------------------- */
/* Ações administrativas (item 23)                                            */
/* -------------------------------------------------------------------------- */

export type AdminActionResult = { ok: boolean; message: string };

/** Reprocessa a história do zero, apagando a interpretação anterior. */
export async function adminReprocessStory(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'pedido não existe');

  const { updateSongRequest } = await import('@/repositories/song-request-repository');
  await updateSongRequest(orderId, {
    structured_story: null,
    lyrics: null,
    music_direction: null,
    music_generation_prompt: null,
    story_summary: null,
  });

  await updateOrderStatusIfIn(orderId, statusesThatCanBecome('STORY_PROCESSING'), {
    status: 'STORY_PROCESSING',
  });

  const job = await enqueueJob({
    type: 'PROCESS_STORY',
    orderId,
    dedupeKey: `process-story:${orderId}:${Date.now()}`,
  });

  await audit(orderId, 'admin_reprocess_story', actor, { job_id: job?.id ?? null });

  return { ok: true, message: 'História enviada para reprocessamento.' };
}

/** Regera a prévia. Cancela a geração viva antes, liberando o índice único. */
export async function adminRegeneratePreview(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const settings = await getSettings();
  await cancelAliveGenerations(orderId, 'PREVIEW', `regeneração solicitada por ${actor}`);

  await updateOrderStatusIfIn(orderId, statusesThatCanBecome('PREVIEW_QUEUED'), {
    status: 'PREVIEW_QUEUED',
  });

  const job = await enqueueJob({
    type: 'GENERATE_PREVIEW',
    orderId,
    dedupeKey: `generate-preview:${orderId}:${Date.now()}`,
    maxAttempts: settings.max_generation_attempts,
  });

  await audit(orderId, 'admin_regenerate_preview', actor, { job_id: job?.id ?? null });
  return { ok: true, message: 'Nova prévia entrou na fila.' };
}

/**
 * Regera a música completa.
 *
 * Só é permitida em pedido pago — a regra vale também para o administrador, e
 * é reforçada de novo dentro do serviço de geração.
 */
export async function adminRegenerateFullSong(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'pedido não existe');

  if (!order.paid_at) {
    return { ok: false, message: 'Este pedido ainda não foi pago.' };
  }

  const settings = await getSettings();
  await cancelAliveGenerations(orderId, 'FULL', `regeneração solicitada por ${actor}`);

  await updateOrderStatusIfIn(orderId, statusesThatCanBecome('FULL_SONG_QUEUED'), {
    status: 'FULL_SONG_QUEUED',
  });

  const job = await enqueueJob({
    type: 'GENERATE_FULL_SONG',
    orderId,
    dedupeKey: `generate-full:${orderId}:${Date.now()}`,
    maxAttempts: settings.max_generation_attempts,
  });

  await audit(orderId, 'admin_regenerate_full', actor, { job_id: job?.id ?? null });
  return { ok: true, message: 'Nova gravação entrou na fila.' };
}

export async function adminResendDelivery(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const job = await enqueueJob({
    type: 'SEND_DELIVERY',
    orderId,
    dedupeKey: `send-delivery:${orderId}:${Date.now()}`,
  });

  await audit(orderId, 'admin_resend_delivery', actor, { job_id: job?.id ?? null });
  return { ok: true, message: 'Entrega reenviada.' };
}

export async function adminCancelOrder(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'pedido não existe');

  if (order.paid_at) {
    return {
      ok: false,
      message: 'Pedido pago não pode ser cancelado por aqui. Faça o estorno no gateway primeiro.',
    };
  }

  const eligible = statusesThatCanBecome('CANCELLED') as OrderStatus[];
  const updated = await updateOrderStatusIfIn(orderId, eligible, { status: 'CANCELLED' });

  if (!updated) return { ok: false, message: 'O pedido não pode ser cancelado no estado atual.' };

  await cancelAliveGenerations(orderId, 'PREVIEW', 'pedido cancelado');
  await cancelAliveGenerations(orderId, 'FULL', 'pedido cancelado');
  await audit(orderId, 'admin_cancel_order', actor, {});

  return { ok: true, message: 'Pedido cancelado.' };
}

export async function adminToggleReviewFlag(
  orderId: string,
  actor: string,
): Promise<AdminActionResult> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', 'pedido não existe');

  const next = !order.admin_flagged;
  await updateOrder(orderId, { admin_flagged: next });
  await audit(orderId, next ? 'admin_flagged' : 'admin_unflagged', actor, {});

  return { ok: true, message: next ? 'Pedido marcado para revisão.' : 'Marcação removida.' };
}

async function audit(
  orderId: string,
  eventType: string,
  actor: string,
  metadata: Record<string, string | null>,
): Promise<void> {
  await recordOrderEvent({ orderId, eventType, actor, metadata, message: `Ação de ${actor}` });
  logger.info('admin.action', { order_id: orderId, event_type: eventType, actor });
}
