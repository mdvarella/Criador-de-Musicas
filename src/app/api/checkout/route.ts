import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, toTechnicalMessage, toUserMessage } from '@/lib/errors';
import { generateRequestId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, clientIpFrom, enforceRateLimit } from '@/lib/rate-limit';
import { createCheckout } from '@/services/payment-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Criação do pagamento.
 *
 * Repare no que o schema NÃO aceita: valor, plano ou preço. O montante é lido
 * do pedido no banco. O frontend só informa como o cliente quer pagar.
 */
const checkoutSchema = z.object({
  publicToken: z.string().min(8).max(64),
  method: z.enum(['pix', 'card']),
  /** Token do cartão gerado pelo SDK no browser — nunca o número do cartão. */
  cardToken: z.string().max(200).optional(),
  installments: z.number().int().min(1).max(12).optional(),
  paymentMethodId: z.string().max(60).optional(),
  issuerId: z.string().max(60).optional(),
  identificationNumber: z
    .string()
    .max(20)
    .transform((v) => v.replace(/\D/g, ''))
    .optional(),
});

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
