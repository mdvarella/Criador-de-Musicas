import { NextResponse } from 'next/server';
import { AppError, toTechnicalMessage, toUserMessage } from '@/lib/errors';
import { generateRequestId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, clientIpFrom, enforceRateLimit } from '@/lib/rate-limit';
import { createOrderSchema } from '@/schemas/song-form';
import { createOrder } from '@/services/order-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Limite defensivo de corpo: a história tem teto de 8k caracteres. */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = logger.child({ request_id: requestId, route: 'POST /api/orders' });

  try {
    await enforceRateLimit(RATE_LIMITS.createOrder, clientIpFrom(request.headers));

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new AppError('VALIDATION_ERROR', `corpo excede ${MAX_BODY_BYTES} bytes`, {
        userMessage: 'Sua história ficou longa demais. Tente resumir um pouco.',
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'corpo não é JSON válido');
    }

    const parsed = createOrderSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'payload reprovado na validação', {
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const { order, publicToken } = await createOrder(parsed.data, { requestId });

    return NextResponse.json(
      { orderId: order.id, publicToken, status: order.status },
      { status: 201 },
    );
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;

    log.error('order.create_failed', { error: toTechnicalMessage(error), status });

    return NextResponse.json(
      {
        message: toUserMessage(error),
        // Só devolvemos detalhe de campo em erro de validação — nunca detalhe técnico.
        ...(error instanceof AppError && error.code === 'VALIDATION_ERROR' && error.details
          ? { fields: error.details }
          : {}),
      },
      { status },
    );
  }
}
