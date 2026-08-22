import type { NotificationChannel, NotificationEventType } from '@/types/domain';

export type NotificationMessage = {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  orderId: string;
  to: string;
  subject: string;
  /** Texto puro, obrigatório: é o que vai para WhatsApp/SMS e o fallback do e-mail. */
  text: string;
  html?: string;
};

export type NotificationSendResult = {
  providerId: string | null;
  provider: string;
};

export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}
