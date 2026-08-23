import 'server-only';
import { centsToBRL } from '@/lib/money';
import { normalizePhoneBR } from '@/lib/format';
import { logger } from '@/lib/logger';
import { labelFor } from '@/schemas/catalog';
import { findOrdersForRecovery } from '@/repositories/order-repository';
import type { RecoveryInput } from '@/schemas/recovery';
import { canAccessFullSong, customerLabel, isPaid } from './order-status';

/**
 * Recuperação de pedido pelo WhatsApp.
 *
 * Devolve o mínimo necessário para o cliente reencontrar a música: nunca a
 * história, nunca a letra, nunca dados de outra pessoa. Só o caminho de volta.
 */
export type RecoveredOrder = {
  recipientName: string;
  occasionLabel: string;
  statusLabel: string;
  priceFormatted: string;
  createdAt: string;
  paid: boolean;
  /** Para onde mandar o cliente: entrega, se pronta; senão, a página do pedido. */
  path: string;
};

export async function recoverOrders(input: RecoveryInput): Promise<RecoveredOrder[]> {
  const phone = normalizePhoneBR(input.whatsapp);
  const orders = await findOrdersForRecovery(phone, input.recipientName);

  logger.info('recovery.lookup', { found: orders.length });

  return orders.map((order) => ({
    recipientName: order.recipient_name,
    occasionLabel: labelFor(order.occasion.split(':')[0]),
    statusLabel: customerLabel(order.status),
    priceFormatted: centsToBRL(order.amount_cents),
    createdAt: order.created_at,
    paid: isPaid(order.status),
    path:
      order.delivery_token && canAccessFullSong(order.status)
        ? `/sua-musica/${order.delivery_token}`
        : `/musica/${order.public_token}`,
  }));
}
