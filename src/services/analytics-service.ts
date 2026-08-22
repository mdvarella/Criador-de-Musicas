import 'server-only';
import { insertAnalyticsEvent } from '@/repositories/analytics-repository';
import type { Json } from '@/types/domain';

/**
 * Funil de conversão (item 27 da especificação).
 *
 * Guardamos os eventos em first-party, no nosso próprio banco. Pixels de Meta,
 * Google e TikTok são camadas adicionais no cliente — se um deles for bloqueado
 * pelo navegador, o funil interno continua íntegro.
 */

export const FUNNEL_EVENTS = [
  'landing_view',
  'create_song_clicked',
  'form_started',
  'form_step_completed',
  'story_submitted',
  'preview_generation_started',
  'preview_ready',
  'preview_played',
  'checkout_started',
  'pix_created',
  'card_payment_started',
  'payment_approved',
  'full_generation_started',
  'full_generation_completed',
  'delivery_opened',
  'song_downloaded',
  'generation_failed',
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(name: string): name is FunnelEvent {
  return (FUNNEL_EVENTS as readonly string[]).includes(name);
}

export async function trackServerEvent(input: {
  eventName: FunnelEvent;
  orderId?: string | null;
  anonymousId?: string | null;
  properties?: Record<string, Json>;
  utm?: Record<string, Json>;
}): Promise<void> {
  await insertAnalyticsEvent({
    eventName: input.eventName,
    orderId: input.orderId ?? null,
    anonymousId: input.anonymousId ?? null,
    properties: input.properties ?? {},
    utm: input.utm ?? {},
  });
}
