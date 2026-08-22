import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { runJobs } from '@/jobs/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Geração musical é demorada: pedimos o teto de execução da plataforma. */
export const maxDuration = 300;

/**
 * Worker da fila.
 *
 * Acionado pelo cron da Vercel (ver `vercel.json`) e, se necessário, à mão pelo
 * painel. Protegido por um segredo comparado em tempo constante — sem ele,
 * qualquer um poderia disparar gerações.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = serverEnv().JOBS_WORKER_SECRET;

  if (!secret) {
    logger.error('jobs.worker_secret_missing');
    return NextResponse.json({ message: 'worker não configurado' }, { status: 503 });
  }

  const header =
    request.headers.get('authorization') ?? request.headers.get('x-worker-secret') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');

  if (!secureEquals(provided, secret)) {
    return NextResponse.json({ message: 'não autorizado' }, { status: 401 });
  }

  const limit = Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '3', 10);
  const result = await runJobs({ limit: Number.isFinite(limit) ? limit : 3 });

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

function secureEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
