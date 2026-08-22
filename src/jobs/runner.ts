import 'server-only';
import { randomUUID } from 'node:crypto';
import { AppError, toTechnicalMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  claimJobs,
  completeJob,
  failJob,
  requeueStuckJobs,
} from '@/repositories/job-repository';
import type { JobRow } from '@/types/database';
import { JOB_HANDLERS } from './handlers';

/**
 * Worker da fila (item 16 da especificação).
 *
 * Roda em uma rota HTTP acionada por cron da Vercel e também pode ser chamado
 * manualmente pelo painel. A reserva dos jobs é atômica no banco, então
 * execuções concorrentes não pisam umas nas outras — o que importa em
 * serverless, onde não há um processo único.
 *
 * O contrato é deliberadamente simples para permitir a troca por um serviço
 * dedicado de filas depois: `claim -> executa -> complete/fail`.
 */

export type RunResult = {
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  requeuedStuck: number;
  durationMs: number;
};

export async function runJobs(options: { limit?: number; budgetMs?: number } = {}): Promise<RunResult> {
  const workerId = `worker_${randomUUID().slice(0, 8)}`;
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 50_000;

  // Jobs cujo worker morreu no meio voltam para a fila antes de qualquer coisa.
  const requeuedStuck = await requeueStuckJobs(15).catch((error) => {
    logger.warn('jobs.requeue_stuck_failed', { error: toTechnicalMessage(error) });
    return 0;
  });

  const jobs = await claimJobs(workerId, options.limit ?? 3);
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    if (Date.now() - startedAt > budgetMs) {
      // Sem tempo para este job: devolve à fila em vez de estourar o limite da
      // função serverless no meio de uma geração.
      await failJob(job.id, 'orçamento de tempo do worker esgotado', {
        retryable: true,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      });
      continue;
    }

    const ok = await executeJob(job, workerId);
    if (ok) succeeded += 1;
    else failed += 1;
  }

  const result: RunResult = {
    workerId,
    claimed: jobs.length,
    succeeded,
    failed,
    requeuedStuck,
    durationMs: Date.now() - startedAt,
  };

  if (jobs.length > 0) logger.info('jobs.run_finished', { ...result });
  return result;
}

async function executeJob(job: JobRow, workerId: string): Promise<boolean> {
  const log = logger.child({
    job_id: job.id,
    order_id: job.order_id ?? undefined,
    worker: workerId,
    job_type: job.type,
  });

  const handler = JOB_HANDLERS[job.type];
  if (!handler) {
    await failJob(job.id, `handler não registrado para ${job.type}`, {
      retryable: false,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
    });
    return false;
  }

  const startedAt = Date.now();

  try {
    await handler(job);
    await completeJob(job.id);
    log.info('job.completed', { duration_ms: Date.now() - startedAt });
    return true;
  } catch (error) {
    const retryable = error instanceof AppError ? error.retryable : true;
    const message = toTechnicalMessage(error);

    const outcome = await failJob(job.id, message, {
      retryable,
      attemptCount: job.attempt_count,
      maxAttempts: job.max_attempts,
    });

    log.error('job.failed', {
      error: message,
      retryable,
      attempt: job.attempt_count,
      max_attempts: job.max_attempts,
      requeued: outcome.requeued,
      next_retry_at: outcome.nextRetryAt,
      duration_ms: Date.now() - startedAt,
    });

    return false;
  }
}

/**
 * Execução direta de um job específico, usada pelas ações administrativas.
 * Continua passando pelo mesmo handler — nada de caminho paralelo.
 */
export async function runJobNow(job: JobRow): Promise<boolean> {
  return executeJob(job, 'admin');
}
