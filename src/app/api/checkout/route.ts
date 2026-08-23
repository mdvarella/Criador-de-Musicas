import { NextResponse } from 'next/server';
import { AppError, toTechnicalMessage, toUserMessage } from '@/lib/errors';
import { generateRequestId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, clientIpFrom, enforceRateLimit } from '@/lib/rate-limit';
import { checkoutSchema } from '@/schemas/checkout';
import { createCheckout } from '@/services/payment-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Criação do pagamento.
 *
 * Repare no que o schema NÃO aceita: valor, plano ou preço. O montante é lido
 * do pedido no banco. O frontend só informa como o cliente quer pagar.
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = logger.child({ request_id: requestId, route: 'POST /api/checkout' });

  try {
    await enforceRateLimit(RATE_LIMITS.createPayment, clientIpFrom(request.headers));

    const parsed = checkoutSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'payload de checkout inválido');
    }

    // Defesa em profundidade: campos de cartão em texto claro nunca devem chegar
    // até aqui. Se chegarem, recusamos antes de qualquer processamento.
    const rawKeys = Object.keys(parsed.data as Record<string, unknown>);
    if (rawKeys.some((key) => /card_number|cardNumber|cvv|security_code/i.test(key))) {
      throw new AppError('VALIDATION_ERROR', 'dados sensíveis de cartão não são aceitos');
    }

    const result = await createCheckout(parsed.data);

    log.info('checkout.created', {
      public_token: parsed.data.publicToken,
      method: parsed.data.method,
      status: result.status,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    log.error('checkout.failed', { error: toTechnicalMessage(error), status });
    return NextResponse.json({ message: toUserMessage(error) }, { status });
  }
}
