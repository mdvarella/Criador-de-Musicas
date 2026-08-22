import 'server-only';
import { findOrderById } from '@/repositories/order-repository';
import { canAccessFullSong } from './order-status';

/**
 * Decide se um arquivo pode ser servido.
 *
 * PREVIEW: liberado enquanto o pedido existir e não estiver cancelado.
 * FULL: exige pagamento confirmado (`canAccessFullSong`). Um token assinado
 * válido não é suficiente — o estado do pedido manda.
 */
export async function getOrderForMedia(args: {
  generationOrderId: string;
  generationType: 'PREVIEW' | 'FULL';
  scope: 'preview' | 'full';
}): Promise<boolean> {
  // O escopo do token precisa bater com o tipo da geração: um token de prévia
  // nunca abre a música completa.
  const expectedScope = args.generationType === 'PREVIEW' ? 'preview' : 'full';
  if (args.scope !== expectedScope) return false;

  const order = await findOrderById(args.generationOrderId);
  if (!order) return false;

  if (args.generationType === 'FULL') {
    return canAccessFullSong(order.status);
  }

  return order.status !== 'CANCELLED' && order.status !== 'REFUNDED';
}
