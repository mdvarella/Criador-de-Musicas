import 'server-only';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { NotificationEventRow, OrderEventRow } from '@/types/database';
import type { Json, NotificationChannel, NotificationStatus } from '@/types/domain';
import { unwrapList } from './errors';

/**
 * Timeline do pedido.
 *
 * Registrar um evento nunca pode derrubar a operação principal: se a escrita
 * falhar, logamos e seguimos. Perder um item de auditoria é ruim; perder uma
 * venda por causa dele seria pior.
 */
export async function recordOrderEvent(input: {
  orderId: string;
  eventType: string;
  message?: string;
  metadata?: Record<string, Json>;
  actor?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin().from('order_events').insert({
    order_id: input.orderId,
    event_type: input.eventType,
    message: input.message ?? null,
    metadata: (input.metadata ?? {}) as Json,
    actor: input.actor ?? 'system',
  });

  if (error) {
    logger.warn('order_event.insert_failed', {
      order_id: input.orderId,
      event_type: input.eventType,
      error: error.message,
    });
  }
}

export async function listOrderEvents(orderId: string, limit = 200): Promise<OrderEventRow[]> {
  return unwrapList(
    await supabaseAdmin()
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'order_events.listByOrder',
  );
}

export async function listNotificationEvents(orderId: string): Promise<NotificationEventRow[]> {
  return unwrapList(
    await supabaseAdmin()
      .from('notification_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    'notification_events.listByOrder',
  );
}

export async function recordNotificationEvent(input: {
  orderId: string;
  channel: NotificationChannel;
  eventType: string;
  status: NotificationStatus;
  provider?: string | null;
  providerId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('notification_events')
    .insert({
      order_id: input.orderId,
      channel: input.channel,
      event_type: input.eventType,
      status: input.status,
      provider: input.provider ?? null,
      provider_id: input.providerId ?? null,
      error_message: input.errorMessage ?? null,
      sent_at: input.status === 'SENT' ? new Date().toISOString() : null,
    });

  if (error) {
    logger.warn('notification_event.insert_failed', {
      order_id: input.orderId,
      event_type: input.eventType,
      error: error.message,
    });
  }
}

/** Um mesmo aviso não é enviado duas vezes para o mesmo pedido e canal. */
export async function hasSentNotification(
  orderId: string,
  channel: NotificationChannel,
  eventType: string,
): Promise<boolean> {
  const rows = unwrapList(
    await supabaseAdmin()
      .from('notification_events')
      .select('id')
      .eq('order_id', orderId)
      .eq('channel', channel)
      .eq('event_type', eventType)
      .eq('status', 'SENT')
      .limit(1),
    'notification_events.hasSent',
  );
  return rows.length > 0;
}
