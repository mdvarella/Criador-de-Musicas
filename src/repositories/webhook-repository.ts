import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { WebhookEventRow } from '@/types/database';
import type { Json } from '@/types/domain';

/**
 * Registro de webhooks recebidos — a base da idempotência.
 *
 * `claimWebhookEvent` insere o evento com uma restrição de unicidade sobre
 * (provider, event_key). O primeiro insert vence; qualquer reentrega do mesmo
 * evento colide e é descartada. É isso que impede duas gerações (e duas
 * cobranças) a partir de uma notificação repetida.
 */
export type WebhookClaim =
  | { claimed: true; event: WebhookEventRow }
  | { claimed: false; reason: 'duplicate'; existing: WebhookEventRow | null };

export async function claimWebhookEvent(input: {
  provider: string;
  eventKey: string;
  eventType: string | null;
  signatureValid: boolean;
  payload: Json;
}): Promise<WebhookClaim> {
  const { data, error } = await supabaseAdmin()
    .from('webhook_events')
    .insert({
      provider: input.provider,
      event_key: input.eventKey,
      event_type: input.eventType,
      signature_valid: input.signatureValid,
      payload: input.payload,
    })
    .select('*')
    .single();

  if (!error && data) return { claimed: true, event: data };

  if (error?.code === '23505') {
    const { data: existing } = await supabaseAdmin()
      .from('webhook_events')
      .select('*')
      .eq('provider', input.provider)
      .eq('event_key', input.eventKey)
      .maybeSingle();
    return { claimed: false, reason: 'duplicate', existing: existing ?? null };
  }

  throw new Error(`webhook_events.claim: ${error?.message ?? 'erro desconhecido'}`);
}

export async function markWebhookProcessed(id: string, processingError?: string): Promise<void> {
  await supabaseAdmin()
    .from('webhook_events')
    .update({
      processed_at: new Date().toISOString(),
      processing_error: processingError?.slice(0, 2000) ?? null,
    })
    .eq('id', id);
}

/**
 * Libera o registro quando o processamento falhou de forma transitória, para
 * que a reentrega natural do gateway possa tentar de novo.
 */
export async function releaseWebhookEvent(id: string, processingError: string): Promise<void> {
  await supabaseAdmin().from('webhook_events').delete().eq('id', id);
  // O motivo fica no log; o registro sai para permitir o reprocessamento.
  void processingError;
}
