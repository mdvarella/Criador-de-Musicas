import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { NotificationChannel } from '@/types/domain';
import type { NotificationMessage, NotificationProvider, NotificationSendResult } from './types';

/**
 * WhatsApp — canal principal de comunicação do produto, ainda NÃO habilitado.
 *
 * LIMITAÇÃO REGISTRADA: envio ativo pelo WhatsApp exige uma conta aprovada na
 * WhatsApp Business Platform (Meta) com templates de mensagem aprovados, ou um
 * BSP intermediário. Nada disso é resolvível em código sozinho, e a
 * especificação proíbe automação frágil como solução silenciosa.
 *
 * Enquanto a conta não existe, este provider registra a intenção de envio e
 * devolve SKIPPED — o histórico do pedido mostra exatamente o que teria sido
 * enviado, e ligar o canal depois é implementar `send` aqui.
 */
export class WhatsAppNotConfiguredProvider implements NotificationProvider {
  readonly name = 'whatsapp-pending';
  readonly channel: NotificationChannel = 'WHATSAPP';

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    logger.warn('notification.whatsapp_not_configured', {
      order_id: message.orderId,
      event_type: message.eventType,
      to: message.to,
    });

    throw new AppError('PROVIDER_ERROR', 'canal WhatsApp ainda não configurado', {
      retryable: false,
    });
  }
}
