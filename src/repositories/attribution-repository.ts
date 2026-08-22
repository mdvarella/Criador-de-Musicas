import 'server-only';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OrderAttributionRow } from '@/types/database';
import { unwrapMaybe } from './errors';

export type AttributionInput = {
  orderId: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  landing_path?: string;
  referrer?: string;
};

/** Atribuição é dado de marketing: nunca pode bloquear a criação do pedido. */
export async function saveAttribution(input: AttributionInput): Promise<void> {
  const { orderId, ...rest } = input;

  const { error } = await supabaseAdmin()
    .from('order_attribution')
    .upsert({ order_id: orderId, ...rest }, { onConflict: 'order_id' });

  if (error) {
    logger.warn('attribution.save_failed', { order_id: orderId, error: error.message });
  }
}

export async function findAttribution(orderId: string): Promise<OrderAttributionRow | null> {
  return unwrapMaybe(
    await supabaseAdmin()
      .from('order_attribution')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle(),
    'order_attribution.find',
  );
}
