import { NextResponse } from 'next/server';
import { AppError, toUserMessage } from '@/lib/errors';
import { RATE_LIMITS, clientIpFrom, checkRateLimit } from '@/lib/rate-limit';
import { getPublicOrderView } from '@/services/order-view-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Status do pedido, consultado em intervalos pela tela de acompanhamento.
 *
 * Devolve apenas a projeção pública — nenhum dado de cliente, nenhuma letra,
 * nenhuma URL de música completa antes do pagamento.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  try {
    const limit = await checkRateLimit(RATE_LIMITS.orderStatus, clientIpFrom(request.headers));
    if (!limit.allowed) {
      return NextResponse.json({ message: toUserMessage(new AppError('RATE_LIMITED', '')) }, { status: 429 });
    }

    const view = await getPublicOrderView(token);
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ message: toUserMessage(error) }, { status });
  }
}
