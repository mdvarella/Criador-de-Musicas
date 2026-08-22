import { logger } from '@/lib/logger';
import type { NotificationChannel } from '@/types/domain';
import type { NotificationMessage, NotificationProvider, NotificationSendResult } from './types';

/**
 * Provider padrão em desenvolvimento: registra a notificação no log em vez de
 * enviar. Permite validar o disparo, o conteúdo e a idempotência sem custo.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console';
  readonly channel: NotificationChannel;

  constructor(channel: NotificationChannel = 'EMAIL') {
    this.channel = channel;
  }

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    logger.info('notification.console', {
      order_id: message.orderId,
      channel: message.channel,
      event_type: message.eventType,
      to: message.to,
      subject: message.subject,
      preview: message.text.slice(0, 200),
    });

    return { providerId: null, provider: this.name };
  }
}
