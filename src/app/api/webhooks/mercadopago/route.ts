import { NextResponse } from 'next/server';
import { generateRequestId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { handleMercadoPagoWebhook } from '@/services/payment-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook do Mercado Pago (item 13 da especificação).
 *
 * O corpo é lido como texto cru porque a assinatura é calculada sobre valores
 * dos headers e da query — nunca reserializamos o JSON antes de validar.
 *
 * Contrato de resposta:
 *   200 -> evento aceito (ou duplicado, ou irrelevante): não reentregar
 *   401 -> assinatura inválida
 *   500 -> falha transitória: o gateway deve reentregar
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();
  const log = logger.child({ request_id: requestId, route: 'POST /api/webhooks/mercadopago' });

  try {
    const rawBody = await request.text();

    const result = await handleMercadoPagoWebhook({
      headers: request.headers,
      url: new URL(request.url),
      rawBody,
      requestId,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    log.error('webhook.unhandled_error', {
      error: error instanceof Error ? error.message : String(error),
    });
    // 500 faz o gateway tentar de novo — é o que queremos diante de falha nossa.
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

/** Alguns painéis fazem um GET de verificação ao cadastrar a URL. */
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
