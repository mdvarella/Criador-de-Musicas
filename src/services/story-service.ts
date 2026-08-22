import 'server-only';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getLLMProvider } from '@/providers/llm';
import { labelFor, styleHint } from '@/schemas/catalog';
import { recordOrderEvent } from '@/repositories/event-repository';
import { enqueueJob } from '@/repositories/job-repository';
import { findOrderById } from '@/repositories/order-repository';
import {
  findSongRequestByOrderId,
  updateSongRequest,
} from '@/repositories/song-request-repository';
import type { Json } from '@/types/domain';
import { advanceOrderStatus } from './order-service';
import { getSettings } from './settings-service';

/**
 * Interpretação da história (Fase 3).
 *
 * Roda dentro de um job, nunca no ciclo da requisição do cliente. Ao final,
 * decide o próximo passo do funil: gerar a prévia ou ir direto ao checkout,
 * conforme `preview_enabled`.
 */
export async function processStory(orderId: string): Promise<void> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', `pedido ${orderId} não existe`);

  const songRequest = await findSongRequestByOrderId(orderId);
  if (!songRequest) throw new AppError('NOT_FOUND', `história do pedido ${orderId} não existe`);

  // Já processada: o job foi reentregue. Seguimos direto para o próximo passo.
  if (songRequest.lyrics && songRequest.structured_story) {
    logger.info('story.already_processed', { order_id: orderId });
    await scheduleNextStep(orderId);
    return;
  }

  const settings = await getSettings();
  await advanceOrderStatus(order, 'STORY_PROCESSING', { message: 'Lendo a história do cliente' });

  const provider = await getLLMProvider();
  const details = (songRequest.special_details ?? {}) as Record<string, string | undefined>;

  const result = await provider.interpretStory({
    recipientName: order.recipient_name,
    relationship: labelFor(order.relationship),
    occasion: labelFor(order.occasion),
    story: songRequest.original_story,
    specialDetails: details,
    mandatoryPhrase: songRequest.mandatory_phrase ?? undefined,
    musicStyle: labelFor(order.music_style),
    musicStyleHint: styleHint(order.music_style),
    voicePreference: labelFor(order.voice_preference),
    emotionalTone: labelFor(order.emotional_tone),
    targetDurationSeconds: settings.full_song_duration_seconds,
  });

  await updateSongRequest(orderId, {
    structured_story: result.story as unknown as Json,
    lyrics: result.story.lyrics,
    music_direction: result.story.music_direction,
    music_generation_prompt: result.story.music_generation_prompt,
    story_summary: result.story.story_summary,
    llm_provider: result.provider,
    llm_model: result.model,
    llm_input_tokens: result.usage.inputTokens,
    llm_output_tokens: result.usage.outputTokens,
    llm_estimated_cost: result.estimatedCostUsd,
  });

  await recordOrderEvent({
    orderId,
    eventType: 'story_processed',
    message: 'História interpretada e letra criada',
    metadata: {
      provider: result.provider,
      model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      estimated_cost_usd: result.estimatedCostUsd,
    },
  });

  await advanceOrderStatus(
    { id: order.id, status: 'STORY_PROCESSING' },
    'STORY_PROCESSED',
    { message: 'Letra pronta' },
  );

  await scheduleNextStep(orderId);
}

/**
 * Com prévia habilitada, enfileira a geração. Sem prévia, o pedido segue direto
 * para o checkout — a chave `preview_enabled` liga e desliga esse trecho do
 * funil sem mexer em código.
 */
async function scheduleNextStep(orderId: string): Promise<void> {
  const settings = await getSettings();
  const order = await findOrderById(orderId);
  if (!order) return;

  if (!settings.preview_enabled) {
    await advanceOrderStatus(order, 'AWAITING_PAYMENT', {
      message: 'Prévia desabilitada: seguindo direto para o checkout',
    });
    return;
  }

  const queued = await advanceOrderStatus(order, 'PREVIEW_QUEUED', {
    message: 'Prévia entrou na fila',
  });

  if (queued) {
    await enqueueJob({
      type: 'GENERATE_PREVIEW',
      orderId,
      dedupeKey: `generate-preview:${orderId}`,
      maxAttempts: settings.max_generation_attempts,
    });
  }
}
