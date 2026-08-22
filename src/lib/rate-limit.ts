import 'server-only';
import { AppError } from './errors';
import { logger } from './logger';
import { supabaseAdmin } from './supabase/admin';

/**
 * Rate limiting de janela fixa, persistido no Postgres.
 *
 * Em ambiente serverless não existe memória compartilhada entre instâncias, e
 * o volume do MVP é baixo o bastante para que um contador no banco resolva.
 * A troca por Redis/Upstash depois é local a este arquivo.
 */

export type RateLimitRule = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  createOrder: { bucket: 'create_order', limit: 5, windowSeconds: 60 * 10 },
  createPayment: { bucket: 'create_payment', limit: 10, windowSeconds: 60 * 10 },
  orderStatus: { bucket: 'order_status', limit: 120, windowSeconds: 60 },
  analytics: { bucket: 'analytics', limit: 120, windowSeconds: 60 },
  adminLogin: { bucket: 'admin_login', limit: 10, windowSeconds: 60 * 5 },
} as const satisfies Record<string, RateLimitRule>;

function windowStart(windowSeconds: number): string {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

export type RateLimitResult = { allowed: boolean; hits: number; limit: number };

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const safeIdentifier = (identifier || 'unknown').slice(0, 120);

  const { data, error } = await supabaseAdmin().rpc('increment_rate_limit', {
    p_bucket: rule.bucket,
    p_identifier: safeIdentifier,
    p_window_start: windowStart(rule.windowSeconds),
  });

  if (error) {
    // Falha no contador não pode derrubar a venda: registramos e liberamos.
    logger.warn('rate_limit.unavailable', { bucket: rule.bucket, error: error.message });
    return { allowed: true, hits: 0, limit: rule.limit };
  }

  const hits = typeof data === 'number' ? data : 0;
  return { allowed: hits <= rule.limit, hits, limit: rule.limit };
}

export async function enforceRateLimit(rule: RateLimitRule, identifier: string): Promise<void> {
  const result = await checkRateLimit(rule, identifier);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', `rate limit excedido em ${rule.bucket} (${result.hits})`);
  }
}

/** IP do cliente atrás do proxy da Vercel. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
