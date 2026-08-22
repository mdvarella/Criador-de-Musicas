import 'server-only';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/types/domain';
import { unwrapList } from './errors';

export async function insertAnalyticsEvent(input: {
  eventName: string;
  orderId?: string | null;
  anonymousId?: string | null;
  properties?: Record<string, Json>;
  utm?: Record<string, Json>;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('analytics_events')
    .insert({
      event_name: input.eventName,
      order_id: input.orderId ?? null,
      anonymous_id: input.anonymousId ?? null,
      properties: (input.properties ?? {}) as Json,
      utm: (input.utm ?? {}) as Json,
    });

  if (error) {
    logger.warn('analytics.insert_failed', { event_name: input.eventName, error: error.message });
  }
}

export async function countEventsSince(
  eventName: string,
  since: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', eventName)
    .gte('created_at', since);

  if (error) throw new Error(`analytics.count: ${error.message}`);
  return count ?? 0;
}

export async function listRecentEvents(orderId: string, limit = 100) {
  return unwrapList(
    await supabaseAdmin()
      .from('analytics_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'analytics.listByOrder',
  );
}
