import 'server-only';
import { serverEnv } from '@/lib/env';
import type { NotificationChannel } from '@/types/domain';
import { ConsoleNotificationProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import { WhatsAppNotConfiguredProvider } from './whatsapp-provider';
import type { NotificationProvider } from './types';

export type { NotificationMessage, NotificationProvider, NotificationSendResult } from './types';
export { ConsoleNotificationProvider } from './console-provider';
export { ResendEmailProvider } from './resend-provider';
export { WhatsAppNotConfiguredProvider } from './whatsapp-provider';

export function getNotificationProvider(channel: NotificationChannel): NotificationProvider {
  if (channel === 'WHATSAPP') return new WhatsAppNotConfiguredProvider();
  if (channel === 'SMS') return new ConsoleNotificationProvider('SMS');

  return serverEnv().NOTIFICATION_EMAIL_PROVIDER === 'resend'
    ? new ResendEmailProvider()
    : new ConsoleNotificationProvider('EMAIL');
}

/** Canais ativos no MVP. O WhatsApp entra aqui quando a conta for aprovada. */
export function activeNotificationChannels(): NotificationChannel[] {
  return ['EMAIL'];
}
