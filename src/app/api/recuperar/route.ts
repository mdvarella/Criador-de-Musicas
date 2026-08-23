import { NextResponse } from 'next/server';
import { AppError, toTechnicalMessage, toUserMessage } from '@/lib/errors';
import { generateRequestId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, clientIpFrom, enforceRateLimit } from '@/lib/rate-limit';
import { recoverySchema } from '@/schemas/recovery';
import { recoverOrders } from '@/services/recovery-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recuperação de pedido.
 *
 * Endpoint sensível: consulta por telefone. Três cuidados obrigatórios:
 *   1. rate limit apertado, contra varredura de faixas de números;
 *   2. exige telefone E nome do destinatário — o segundo não é público;
 *   3. resposta IDÊNTICA quando não encontra, seja porque o número não existe
 *      ou porque o nome não bate. Distinguir os dois casos entregaria de
 *      graça quais telefones têm pedido.
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = logger.child({ request_id: requestId, route: 'POST /api/recuperar' });

  try {
    await enforceRateLimit(RATE_LIMITS.orderRecovery, clientIpFrom(request.headers));

    const parsed = recoverySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Confira o número e o nome antes de continuar.', orders: [] },
        { status: 400 },
      );
    }

    const orders = await recoverOrders(parsed.data);

    return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    log.error('recovery.failed', { error: toTechnicalMessage(error), status });
    return NextResponse.json({ message: toUserMessage(error), orders: [] }, { status });
  }
}
