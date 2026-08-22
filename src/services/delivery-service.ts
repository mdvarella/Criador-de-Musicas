import 'server-only';
import { AppError } from '@/lib/errors';
import { generateToken } from '@/lib/ids';
import { recordOrderEvent } from '@/repositories/event-repository';
import { findOrderById, updateOrder, updateOrderStatusIfIn } from '@/repositories/order-repository';
import { findReadyGeneration } from '@/repositories/generation-repository';
import { advanceOrderStatus } from './order-service';
import { sendOrderNotification } from './notification-service';

/**
 * Entrega (Fase 8).
 *
 * A entrega só acontece com a música completa realmente pronta no storage. O
 * link de entrega usa um token próprio, distinto do token público usado antes
 * do pagamento.
 */
export async function deliverOrder(orderId: string): Promise<{ deliveryToken: string }> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', `pedido ${orderId} não existe`);

  const generation = await findReadyGeneration(orderId, 'FULL');
  if (!generation?.storage_path) {
    throw new AppError('CONFLICT', `música completa do pedido ${orderId} ainda não está pronta`, {
      retryable: true,
    });
  }

  let deliveryToken = order.delivery_token;
  if (!deliveryToken) {
    deliveryToken = generateToken(24);
    await updateOrder(orderId, { delivery_token: deliveryToken });
  }

  await advanceOrderStatus(order, 'DELIVERY_PENDING', { message: 'Preparando a entrega' });

  await sendOrderNotification(orderId, 'song_ready');

  const delivered = await updateOrderStatusIfIn(orderId, ['DELIVERY_PENDING', 'FULL_SONG_READY'], {
    status: 'DELIVERED',
    delivered_at: new Date().toISOString(),
  });

  if (delivered) {
    await recordOrderEvent({
      orderId,
      eventType: 'order_delivered',
      message: 'Música entregue ao cliente',
      metadata: { generation_id: generation.id },
    });
  }

  return { deliveryToken };
}
