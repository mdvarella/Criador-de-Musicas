import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { GenerationRow } from '@/types/database';
import type { GenerationStatus, GenerationType } from '@/types/domain';
import { unwrap, unwrapList, unwrapMaybe } from './errors';

/** Estados considerados "vivos" — batem com o índice único do banco. */
export const ALIVE_GENERATION_STATUSES: GenerationStatus[] = ['QUEUED', 'RUNNING', 'READY'];

export async function insertGeneration(input: {
  orderId: string;
  type: GenerationType;
  provider: string;
  model: string | null;
  operation: string;
  prompt: string | null;
  lyrics: string | null;
  maxAttempts: number;
}): Promise<GenerationRow> {
  // O índice único parcial `generations_one_alive_per_type` faz este insert
  // falhar com CONFLICT caso já exista uma geração viva do mesmo tipo. É a
  // proteção final contra geração duplicada (item 36 da especificação).
  return unwrap(
    await supabaseAdmin()
      .from('generations')
      .insert({
        order_id: input.orderId,
        type: input.type,
        status: 'QUEUED',
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        prompt: input.prompt,
        lyrics: input.lyrics,
        max_attempts: input.maxAttempts,
      })
      .select('*')
      .single(),
    'generations.insert',
  );
}

export async function findGenerationById(id: string): Promise<GenerationRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('generations').select('*').eq('id', id).maybeSingle(),
    'generations.findById',
  );
}

export async function findAliveGeneration(
  orderId: string,
  type: GenerationType,
): Promise<GenerationRow | null> {
  return unwrapMaybe(
    await supabaseAdmin()
      .from('generations')
      .select('*')
      .eq('order_id', orderId)
      .eq('type', type)
      .in('status', ALIVE_GENERATION_STATUSES)
      .maybeSingle(),
    'generations.findAlive',
  );
}

export async function findReadyGeneration(
  orderId: string,
  type: GenerationType,
): Promise<GenerationRow | null> {
  return unwrapMaybe(
    await supabaseAdmin()
      .from('generations')
      .select('*')
      .eq('order_id', orderId)
      .eq('type', type)
      .eq('status', 'READY')
      .maybeSingle(),
    'generations.findReady',
  );
}

export async function listGenerationsByOrder(orderId: string): Promise<GenerationRow[]> {
  return unwrapList(
    await supabaseAdmin()
      .from('generations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    'generations.listByOrder',
  );
}

export async function updateGeneration(
  id: string,
  patch: Partial<GenerationRow>,
): Promise<GenerationRow> {
  return unwrap(
    await supabaseAdmin().from('generations').update(patch).eq('id', id).select('*').single(),
    'generations.update',
  );
}

/**
 * Encerra uma geração viva para liberar o índice único.
 * Usado antes de qualquer regeneração administrativa.
 */
export async function cancelAliveGenerations(
  orderId: string,
  type: GenerationType,
  reason: string,
): Promise<number> {
  const rows = unwrapList(
    await supabaseAdmin()
      .from('generations')
      .update({
        status: 'CANCELLED',
        error_message: reason,
        finished_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .eq('type', type)
      .in('status', ALIVE_GENERATION_STATUSES)
      .select('id'),
    'generations.cancelAlive',
  );
  return rows.length;
}
