import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { JobRow } from '@/types/database';
import type { Json, JobType } from '@/types/domain';
import { unwrap, unwrapList, unwrapMaybe } from './errors';

export type EnqueueJobInput = {
  type: JobType;
  orderId?: string;
  payload?: Record<string, Json>;
  /** Quando informado, um job vivo com a mesma chave impede a duplicata. */
  dedupeKey?: string;
  runAfter?: Date;
  maxAttempts?: number;
};

/**
 * Enfileira um job.
 *
 * Com `dedupeKey`, o índice único parcial do banco garante que só existe um job
 * vivo por chave. Se já existir, devolvemos null em vez de estourar: enfileirar
 * duas vezes é um caso esperado (retry de webhook), não um erro.
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('jobs')
    .insert({
      type: input.type,
      status: 'PENDING',
      order_id: input.orderId ?? null,
      payload: input.payload ?? {},
      dedupe_key: input.dedupeKey ?? null,
      run_after: (input.runAfter ?? new Date()).toISOString(),
      max_attempts: input.maxAttempts ?? 3,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return null; // já existe um job vivo com essa chave
    throw new Error(`jobs.enqueue: ${error.message}`);
  }

  return data;
}

/** Reserva jobs de forma atômica (FOR UPDATE SKIP LOCKED no banco). */
export async function claimJobs(worker: string, limit: number): Promise<JobRow[]> {
  const { data, error } = await supabaseAdmin().rpc('claim_jobs', {
    p_worker: worker,
    p_limit: limit,
  });

  if (error) throw new Error(`jobs.claim: ${error.message}`);
  return (data ?? []) as JobRow[];
}

export async function completeJob(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('jobs')
    .update({ status: 'DONE', finished_at: new Date().toISOString(), last_error: null })
    .eq('id', id);
  if (error) throw new Error(`jobs.complete: ${error.message}`);
}

/**
 * Devolve o job para a fila com backoff exponencial, ou o marca como FAILED
 * quando as tentativas acabam. Nunca existe loop infinito: `max_attempts` é o
 * teto absoluto (item 17 da especificação).
 */
export async function failJob(
  id: string,
  errorMessage: string,
  options: { retryable: boolean; attemptCount: number; maxAttempts: number },
): Promise<{ requeued: boolean; nextRetryAt: string | null }> {
  const exhausted = !options.retryable || options.attemptCount >= options.maxAttempts;

  if (exhausted) {
    const { error } = await supabaseAdmin()
      .from('jobs')
      .update({
        status: 'FAILED',
        last_error: errorMessage.slice(0, 2000),
        finished_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', id);
    if (error) throw new Error(`jobs.fail: ${error.message}`);
    return { requeued: false, nextRetryAt: null };
  }

  // 1 min, 4 min, 9 min, ... com teto de 30 minutos.
  const delayMinutes = Math.min(options.attemptCount ** 2, 30) || 1;
  const nextRetryAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

  const { error } = await supabaseAdmin()
    .from('jobs')
    .update({
      status: 'PENDING',
      last_error: errorMessage.slice(0, 2000),
      run_after: nextRetryAt,
      next_retry_at: nextRetryAt,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', id);

  if (error) throw new Error(`jobs.requeue: ${error.message}`);
  return { requeued: true, nextRetryAt };
}

export async function requeueStuckJobs(timeoutMinutes = 15): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('requeue_stuck_jobs', {
    p_timeout_minutes: timeoutMinutes,
  });
  if (error) throw new Error(`jobs.requeueStuck: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

export async function listJobsByOrder(orderId: string): Promise<JobRow[]> {
  return unwrapList(
    await supabaseAdmin()
      .from('jobs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    'jobs.listByOrder',
  );
}

export async function findJobById(id: string): Promise<JobRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('jobs').select('*').eq('id', id).maybeSingle(),
    'jobs.findById',
  );
}

export async function countPendingJobs(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['PENDING', 'RUNNING']);
  if (error) throw new Error(`jobs.countPending: ${error.message}`);
  return count ?? 0;
}

export async function insertJobDirect(row: Partial<JobRow>): Promise<JobRow> {
  return unwrap(
    await supabaseAdmin().from('jobs').insert(row).select('*').single(),
    'jobs.insertDirect',
  );
}
