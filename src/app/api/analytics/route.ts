import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, clientIpFrom, checkRateLimit } from '@/lib/rate-limit';
import { insertAnalyticsEvent } from '@/repositories/analytics-repository';
import { findOrderByPublicToken } from '@/repositories/order-repository';
import { isFunnelEvent } from '@/services/analytics-service';
import type { Json } from '@/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  event: z.string().max(60),
  properties: z.record(z.string(), z.unknown()).default({}),
  orderToken: z.string().max(64).optional(),
  anonymousId: z.string().max(64).optional(),
  utm: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Coleta de eventos do funil.
 *
 * Endpoint público por natureza (o browser precisa chamá-lo), então: nome do
 * evento restrito à lista conhecida, tamanho limitado, rate limit por IP e
 * resposta sempre 204 — não é um canal de leitura de dados.
 */
export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit(RATE_LIMITS.analytics, clientIpFrom(request.headers));
    if (!limit.allowed) return new NextResponse(null, { status: 204 });

    const raw = await request.text();
    if (raw.length > 8_000) return new NextResponse(null, { status: 204 });

    const parsed = payloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !isFunnelEvent(parsed.data.event)) {
      return new NextResponse(null, { status: 204 });
    }

    let orderId: string | null = null;
    if (parsed.data.orderToken) {
      const order = await findOrderByPublicToken(parsed.data.orderToken);
      orderId = order?.id ?? null;
    }

    await insertAnalyticsEvent({
      eventName: parsed.data.event,
      orderId,
      anonymousId: parsed.data.anonymousId ?? null,
      properties: parsed.data.properties as Record<string, Json>,
      utm: parsed.data.utm as Record<string, Json>,
    });
  } catch (error) {
    logger.warn('analytics.route_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new NextResponse(null, { status: 204 });
}
