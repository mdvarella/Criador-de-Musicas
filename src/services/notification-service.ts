import 'server-only';
import { AppError } from '@/lib/errors';
import { absoluteUrl, brand } from '@/lib/brand';
import { logger } from '@/lib/logger';
import { activeNotificationChannels, getNotificationProvider } from '@/providers/notification';
import { findCustomerById } from '@/repositories/customer-repository';
import { hasSentNotification, recordNotificationEvent } from '@/repositories/event-repository';
import { findOrderById } from '@/repositories/order-repository';
import type { OrderRow } from '@/types/database';
import type { NotificationEventType } from '@/types/domain';

/**
 * Notificações (item 19 da especificação).
 *
 * Duas garantias: o mesmo aviso não sai duas vezes para o mesmo pedido e canal,
 * e nenhum texto enviado ao cliente menciona IA, provider ou erro técnico.
 */

type MessageTemplate = { subject: string; text: string };

function buildMessage(
  eventType: NotificationEventType,
  order: OrderRow,
  customerName: string,
): MessageTemplate {
  const previewUrl = absoluteUrl(`/musica/${order.public_token}`);
  const deliveryUrl = order.delivery_token
    ? absoluteUrl(`/sua-musica/${order.delivery_token}`)
    : previewUrl;

  const signature = `\n\n${brand.name}${brand.supportEmail ? `\n${brand.supportEmail}` : ''}`;

  switch (eventType) {
    case 'preview_ready':
      return {
        subject: `${customerName}, a prévia da música de ${order.recipient_name} ficou pronta 🎵`,
        text:
          `Oi, ${customerName}!\n\n` +
          `A prévia da música que você criou para ${order.recipient_name} já está pronta para ouvir.\n\n` +
          `${previewUrl}\n\n` +
          `Se gostar, é só liberar a música completa por lá.` +
          signature,
      };

    case 'payment_approved':
      return {
        subject: 'Pagamento confirmado — sua música já está sendo criada ❤️',
        text:
          `Oi, ${customerName}!\n\n` +
          `Recebemos seu pagamento e a música de ${order.recipient_name} já entrou em produção.\n\n` +
          `Assim que ela ficar pronta, avisamos você por aqui.` +
          signature,
      };

    case 'song_generating':
      return {
        subject: 'Sua música está sendo criada 🎶',
        text:
          `Oi, ${customerName}!\n\n` +
          `A música de ${order.recipient_name} está sendo criada agora. Leva alguns minutos.` +
          signature,
      };

    case 'song_ready':
      return {
        subject: `${customerName}, sua música está pronta ❤️`,
        text:
          `Oi, ${customerName}!\n\n` +
          `A música de ${order.recipient_name} ficou pronta. Ouça, baixe e compartilhe:\n\n` +
          `${deliveryUrl}\n\n` +
          `Esse link é só seu. Guarde com carinho.` +
          signature,
      };

    case 'generation_failed':
      return {
        subject: 'Estamos cuidando da sua música',
        text:
          `Oi, ${customerName}!\n\n` +
          `Tivemos um contratempo enquanto criávamos a música de ${order.recipient_name}. ` +
          `Seu pedido está seguro e nossa equipe já está resolvendo — avisamos assim que estiver pronta.` +
          signature,
      };
  }
}

export async function sendOrderNotification(
  orderId: string,
  eventType: NotificationEventType,
): Promise<void> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', `pedido ${orderId} não existe`);

  const customer = await findCustomerById(order.customer_id);
  if (!customer) throw new AppError('NOT_FOUND', `cliente do pedido ${orderId} não existe`);

  const message = buildMessage(eventType, order, customer.name);

  for (const channel of activeNotificationChannels()) {
    if (await hasSentNotification(orderId, channel, eventType)) {
      logger.info('notification.already_sent', { order_id: orderId, channel, event_type: eventType });
      continue;
    }

    const to = channel === 'EMAIL' ? customer.email : customer.phone;

    // Cliente sem e-mail é caso esperado, não erro: parte do público não usa.
    // Registramos como SKIPPED para o painel mostrar que ninguém foi avisado
    // por esse canal — e por quê.
    if (!to) {
      await recordNotificationEvent({
        orderId,
        channel,
        eventType,
        status: 'SKIPPED',
        errorMessage: 'cliente não informou endereço para este canal',
      });
      logger.info('notification.no_address', { order_id: orderId, channel, event_type: eventType });
      continue;
    }

    const provider = getNotificationProvider(channel);

    try {
      const result = await provider.send({
        channel,
        eventType,
        orderId,
        to,
        subject: message.subject,
        text: message.text,
      });

      await recordNotificationEvent({
        orderId,
        channel,
        eventType,
        status: 'SENT',
        provider: result.provider,
        providerId: result.providerId,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      // Canal ainda não configurado (WhatsApp) não é falha do pedido.
      const status = detail.includes('não configurado') ? 'SKIPPED' : 'FAILED';

      await recordNotificationEvent({
        orderId,
        channel,
        eventType,
        status,
        provider: provider.name,
        errorMessage: detail.slice(0, 500),
      });

      logger.warn('notification.send_failed', {
        order_id: orderId,
        channel,
        event_type: eventType,
        error: detail,
      });

      if (status === 'FAILED') throw error;
    }
  }
}
