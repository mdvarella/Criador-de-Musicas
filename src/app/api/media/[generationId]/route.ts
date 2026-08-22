import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyMediaToken, type MediaScope } from '@/lib/signing';
import { getStorageProvider } from '@/providers/storage';
import { findGenerationById } from '@/repositories/generation-repository';
import { getOrderForMedia } from '@/services/media-authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entrega de áudio (item 11 da especificação).
 *
 * Três barreiras, todas obrigatórias:
 *   1. token assinado e com validade (HMAC no servidor);
 *   2. escopo do token igual ao tipo da geração — token de prévia não abre a
 *      música completa;
 *   3. estado do pedido — a música completa exige pagamento confirmado.
 *
 * O bucket é privado: nem a prévia nem a música completa têm URL pública.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ generationId: string }> },
) {
  const { generationId } = await context.params;
  const url = new URL(request.url);

  const scopeParam = url.searchParams.get('scope');
  const scope: MediaScope = scopeParam === 'full' ? 'full' : 'preview';
  const token = url.searchParams.get('token') ?? '';

  const verification = verifyMediaToken(generationId, scope, token);
  if (!verification.valid) {
    logger.warn('media.token_rejected', { generation_id: generationId, reason: verification.reason });
    return new NextResponse(null, { status: 403 });
  }

  const generation = await findGenerationById(generationId);
  if (!generation?.storage_path || generation.status !== 'READY') {
    return new NextResponse(null, { status: 404 });
  }

  const allowed = await getOrderForMedia({
    generationOrderId: generation.order_id,
    generationType: generation.type,
    scope,
  });

  if (!allowed) {
    logger.warn('media.access_denied', {
      generation_id: generationId,
      order_id: generation.order_id,
      scope,
    });
    return new NextResponse(null, { status: 403 });
  }

  const { data, mimeType } = await getStorageProvider().download(generation.storage_path);
  const download = url.searchParams.get('download') === '1';
  const extension = mimeType.includes('wav') ? 'wav' : 'mp3';
  const filename = `musica-${generation.order_id.slice(0, 8)}.${extension}`;

  const headers = new Headers({
    'Content-Type': mimeType,
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': download
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`,
  });

  // Suporte a Range para que o player consiga avançar a faixa.
  const range = request.headers.get('range');
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : data.byteLength - 1;

      if (Number.isFinite(start) && start < data.byteLength && end >= start) {
        const safeEnd = Math.min(end, data.byteLength - 1);
        const slice = data.subarray(start, safeEnd + 1);

        headers.set('Content-Range', `bytes ${start}-${safeEnd}/${data.byteLength}`);
        headers.set('Content-Length', String(slice.byteLength));

        return new NextResponse(slice as unknown as BodyInit, { status: 206, headers });
      }
    }
  }

  headers.set('Content-Length', String(data.byteLength));
  return new NextResponse(data as unknown as BodyInit, { status: 200, headers });
}
