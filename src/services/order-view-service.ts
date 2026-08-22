import 'server-only';
import { AppError } from '@/lib/errors';
import { centsToBRL } from '@/lib/money';
import { mediaUrl } from '@/lib/signing';
import { labelFor } from '@/schemas/catalog';
import { findReadyGeneration } from '@/repositories/generation-repository';
import {
  findOrderByDeliveryToken,
  findOrderByPublicToken,
} from '@/repositories/order-repository';
import { findSongRequestByOrderId } from '@/repositories/song-request-repository';
import { findLatestPendingPayment } from '@/repositories/payment-repository';
import type { OrderStatus } from '@/types/domain';
import { canAccessFullSong, customerLabel, isPaid } from './order-status';

/**
 * Projeções seguras do pedido para as páginas do cliente.
 *
 * Este é o único ponto autorizado a decidir o que o consumidor pode ver. A
 * regra central: a URL da música completa não existe fora de um pedido pago.
 */

export type PublicOrderView = {
  publicToken: string;
  status: OrderStatus;
  statusLabel: string;
  recipientName: string;
  occasionLabel: string;
  relationshipLabel: string;
  styleLabel: string;
  toneLabel: string;
  amountCents: number;
  priceFormatted: string;
  /** Prévia liberada para ouvir. */
  preview: { ready: boolean; url: string | null; durationSeconds: number | null };
  paid: boolean;
  /** Só existe depois do pagamento aprovado e da música pronta. */
  deliveryPath: string | null;
  processing: boolean;
  failed: boolean;
  pendingPix: { qrCode: string | null; qrCodeBase64: string | null; expiresAt: string | null } | null;
};

const PROCESSING_STATUSES = new Set<OrderStatus>([
  'STORY_RECEIVED',
  'STORY_PROCESSING',
  'STORY_PROCESSED',
  'PREVIEW_QUEUED',
  'PREVIEW_GENERATING',
  'PAYMENT_PROCESSING',
  'PAID',
  'FULL_SONG_QUEUED',
  'FULL_SONG_GENERATING',
]);

export async function getPublicOrderView(publicToken: string): Promise<PublicOrderView> {
  const order = await findOrderByPublicToken(publicToken);
  if (!order) throw new AppError('NOT_FOUND', `pedido com token ${publicToken} não existe`);

  const previewGeneration = await findReadyGeneration(order.id, 'PREVIEW');
  const paid = isPaid(order.status);

  const pendingPayment = paid ? null : await findLatestPendingPayment(order.id);

  return {
    publicToken: order.public_token,
    status: order.status,
    statusLabel: customerLabel(order.status),
    recipientName: order.recipient_name,
    occasionLabel: labelFor(order.occasion.split(':')[0]),
    relationshipLabel: labelFor(order.relationship.split(':')[0]),
    styleLabel: labelFor(order.music_style),
    toneLabel: labelFor(order.emotional_tone),
    amountCents: order.amount_cents,
    priceFormatted: centsToBRL(order.amount_cents),
    preview: {
      ready: Boolean(previewGeneration?.storage_path),
      // Token curto: o link da prévia não deve sobreviver a um compartilhamento.
      url: previewGeneration ? mediaUrl(previewGeneration.id, 'preview', 60 * 30) : null,
      durationSeconds: previewGeneration?.duration_seconds ?? null,
    },
    paid,
    deliveryPath:
      paid && order.delivery_token && canAccessFullSong(order.status)
        ? `/sua-musica/${order.delivery_token}`
        : null,
    processing: PROCESSING_STATUSES.has(order.status),
    failed: order.status === 'FAILED',
    pendingPix:
      pendingPayment?.pix_qr_code
        ? {
            qrCode: pendingPayment.pix_qr_code,
            qrCodeBase64: pendingPayment.pix_qr_code_base64,
            expiresAt: pendingPayment.pix_expires_at,
          }
        : null,
  };
}

export type DeliveryView = {
  recipientName: string;
  occasionLabel: string;
  styleLabel: string;
  toneLabel: string;
  lyrics: string | null;
  audioUrl: string;
  downloadUrl: string;
  durationSeconds: number | null;
  deliveredAt: string | null;
  shareText: string;
};

/**
 * Página de entrega.
 *
 * Exige token de entrega válido E status que comprove o pagamento — token
 * sozinho não basta, para que um link vazado de um pedido posteriormente
 * estornado deixe de funcionar.
 */
export async function getDeliveryView(deliveryToken: string): Promise<DeliveryView> {
  const order = await findOrderByDeliveryToken(deliveryToken);
  if (!order) throw new AppError('NOT_FOUND', 'link de entrega inválido');

  if (!canAccessFullSong(order.status)) {
    throw new AppError('NOT_FOUND', `pedido ${order.id} não está liberado para entrega`, {
      userMessage: 'Sua música ainda está sendo finalizada. Avisamos assim que ficar pronta.',
    });
  }

  const generation = await findReadyGeneration(order.id, 'FULL');
  if (!generation?.storage_path) {
    throw new AppError('NOT_FOUND', `música completa do pedido ${order.id} indisponível`, {
      userMessage: 'Sua música ainda está sendo finalizada. Avisamos assim que ficar pronta.',
    });
  }

  const songRequest = await findSongRequestByOrderId(order.id);

  return {
    recipientName: order.recipient_name,
    occasionLabel: labelFor(order.occasion.split(':')[0]),
    styleLabel: labelFor(order.music_style),
    toneLabel: labelFor(order.emotional_tone),
    lyrics: songRequest?.lyrics ?? null,
    audioUrl: mediaUrl(generation.id, 'full', 60 * 60 * 2),
    downloadUrl: `${mediaUrl(generation.id, 'full', 60 * 60 * 2)}&download=1`,
    durationSeconds: generation.duration_seconds,
    deliveredAt: order.delivered_at,
    shareText: `Fiz uma música só para ${order.recipient_name} ❤️`,
  };
}
