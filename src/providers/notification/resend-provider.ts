import 'server-only';
import { AppError } from '@/lib/errors';
import { requireEnv, serverEnv } from '@/lib/env';
import type { NotificationChannel } from '@/types/domain';
import type { NotificationMessage, NotificationProvider, NotificationSendResult } from './types';

/** Envio de e-mail transacional via Resend (REST, sem SDK). */
export class ResendEmailProvider implements NotificationProvider {
  readonly name = 'resend';
  readonly channel: NotificationChannel = 'EMAIL';

  async send(message: NotificationMessage): Promise<NotificationSendResult> {
    const apiKey = requireEnv('RESEND_API_KEY');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: serverEnv().NOTIFICATION_EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppError(
        'PROVIDER_ERROR',
        `Resend respondeu ${response.status}: ${body.slice(0, 300)}`,
        { retryable: response.status >= 500 || response.status === 429 },
      );
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { providerId: data.id ?? null, provider: this.name };
  }
}
