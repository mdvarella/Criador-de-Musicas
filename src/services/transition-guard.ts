import 'server-only';
import { logger } from '@/lib/logger';
import { recordOrderEvent } from '@/repositories/event-repository';
import type { OrderRow } from '@/types/database';
import type { OrderStatus } from '@/types/domain';
import { canTransition } from './order-status';

/**
 * Guarda de entrada dos serviços que gastam dinheiro.
 *
 * Existe por causa de um incidente real: um job de reprocessamento rodou sobre
 * um pedido em AWAITING_PAYMENT, teve a transição recusada — e mesmo assim
 * seguiu chamando o modelo de texto, gerando custo para um pedido em estado
 * inválido.
 *
 * A checagem é PURA (não escreve nada): só depois de passar por aqui é que o
 * serviço reserva a geração e chama o provider. Quando não passa, o motivo fica
 * na linha do tempo do pedido, para o administrador entender o que aconteceu em
 * vez de ver um job silenciosamente concluído.
 */
export async function ensureCanEnter(
  order: Pick<OrderRow, 'id' | 'status'>,
  to: OrderStatus,
  operation: string,
): Promise<boolean> {
  if (canTransition(order.status, to)) return true;

  logger.warn('order.entry_transition_refused', {
    order_id: order.id,
    from: order.status,
    to,
    operation,
  });

  await recordOrderEvent({
    orderId: order.id,
    eventType: 'operation_skipped',
    message: `${operation} não executado: o pedido está em ${order.status}`,
    metadata: { from: order.status, to, operation },
  });

  return false;
}
