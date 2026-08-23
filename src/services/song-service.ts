import 'server-only';
import { AppError } from '@/lib/errors';
import { generateToken } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getMusicProvider, type MusicSection } from '@/providers/music';
import { getStorageProvider } from '@/providers/storage';
import { styleHint } from '@/schemas/catalog';
import { structuredStorySchema, type StructuredStory } from '@/schemas/story';
import { recordOrderEvent } from '@/repositories/event-repository';
import {
  cancelAliveGenerations,
  findAliveGeneration,
  insertGeneration,
  updateGeneration,
} from '@/repositories/generation-repository';
import { enqueueJob } from '@/repositories/job-repository';
import { findOrderById, updateOrder } from '@/repositories/order-repository';
import { findSongRequestByOrderId } from '@/repositories/song-request-repository';
import type { GenerationRow, OrderRow, SongRequestRow } from '@/types/database';
import type { GenerationType } from '@/types/domain';
import { trackServerEvent } from './analytics-service';
import { advanceOrderStatus } from './order-service';
import { isPaid } from './order-status';
import { getSettings } from './settings-service';
import { ensureCanEnter } from './transition-guard';

/**
 * Geração musical (Fases 4, 5 e 7).
 *
 * Duas invariantes governam este arquivo:
 *   1. Nunca existe mais de uma geração viva por pedido e por tipo — o índice
 *      único no banco é a garantia final, e a checagem aqui evita o erro.
 *   2. A música completa só começa depois do pagamento APROVADO confirmado
 *      pelo servidor.
 */

export async function generatePreview(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);
  const settings = await getSettings();

  if (!settings.preview_enabled) {
    logger.info('preview.disabled', { order_id: orderId });
    await advanceOrderStatus(order, 'AWAITING_PAYMENT', { message: 'Prévia desabilitada' });
    return;
  }

  // Antes de qualquer leitura pesada ou reserva: o pedido pode entrar em
  // geração? Se não, nada mais acontece.
  if (!(await ensureCanEnter(order, 'PREVIEW_GENERATING', 'geração da prévia'))) return;

  const { songRequest, story } = await loadStory(order);

  const generation = await claimGeneration(order, 'PREVIEW', {
    prompt: story.music_generation_prompt,
    lyrics: story.preview_hook,
    maxAttempts: settings.max_generation_attempts,
  });

  if (!generation) return; // já pronta ou já em andamento

  await advanceOrderStatus(order, 'PREVIEW_GENERATING', { message: 'Compondo a prévia' });
  await trackServerEvent({
    eventName: 'preview_generation_started',
    orderId,
    properties: { generation_id: generation.id },
  });

  await runGeneration({
    order,
    songRequest,
    story,
    generation,
    type: 'PREVIEW',
    targetDurationSeconds: settings.preview_duration_seconds,
  });

  await advanceOrderStatus(
    { id: order.id, status: 'PREVIEW_GENERATING' },
    'PREVIEW_READY',
    { message: 'Prévia pronta para ouvir' },
  );

  await trackServerEvent({ eventName: 'preview_ready', orderId });
  await enqueueJob({
    type: 'SEND_NOTIFICATION',
    orderId,
    dedupeKey: `notify:preview_ready:${orderId}`,
    payload: { event_type: 'preview_ready' },
  });
}

export async function generateFullSong(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);

  // Trava dura: sem pagamento confirmado, não existe geração completa.
  if (!isPaid(order.status) || !order.paid_at) {
    throw new AppError(
      'FORBIDDEN',
      `tentativa de gerar música completa sem pagamento confirmado (status ${order.status})`,
      { retryable: false },
    );
  }

  if (!(await ensureCanEnter(order, 'FULL_SONG_GENERATING', 'gravação da música completa'))) {
    return;
  }

  const { songRequest, story } = await loadStory(order);
  const settings = await getSettings();

  const generation = await claimGeneration(order, 'FULL', {
    prompt: story.music_generation_prompt,
    lyrics: story.lyrics,
    maxAttempts: settings.max_generation_attempts,
  });

  if (!generation) return;

  await advanceOrderStatus(order, 'FULL_SONG_GENERATING', { message: 'Gravando a música' });
  await trackServerEvent({
    eventName: 'full_generation_started',
    orderId,
    properties: { generation_id: generation.id },
  });

  await runGeneration({
    order,
    songRequest,
    story,
    generation,
    type: 'FULL',
    targetDurationSeconds: settings.full_song_duration_seconds,
  });

  // O token de entrega só nasce agora, e é diferente do token público usado
  // antes do pagamento.
  const deliveryToken = order.delivery_token ?? generateToken(24);
  if (!order.delivery_token) {
    await updateOrder(order.id, { delivery_token: deliveryToken });
  }

  await advanceOrderStatus(
    { id: order.id, status: 'FULL_SONG_GENERATING' },
    'FULL_SONG_READY',
    { message: 'Música completa pronta' },
  );

  await trackServerEvent({ eventName: 'full_generation_completed', orderId });
  await enqueueJob({
    type: 'SEND_DELIVERY',
    orderId,
    dedupeKey: `send-delivery:${orderId}`,
  });
}

async function loadOrder(orderId: string): Promise<OrderRow> {
  const order = await findOrderById(orderId);
  if (!order) throw new AppError('NOT_FOUND', `pedido ${orderId} não existe`);
  return order;
}

/**
 * Carrega a interpretação da história.
 *
 * Separada de `loadOrder` de propósito: a guarda de transição precisa rodar
 * ANTES desta leitura. Se a história ainda não foi interpretada, o erro é
 * reprocessável — o job de interpretação pode estar na fila.
 */
async function loadStory(
  order: OrderRow,
): Promise<{ songRequest: SongRequestRow; story: StructuredStory }> {
  const songRequest = await findSongRequestByOrderId(order.id);
  if (!songRequest?.structured_story) {
    throw new AppError('CONFLICT', `história do pedido ${order.id} ainda não foi interpretada`, {
      retryable: true,
    });
  }

  const parsed = structuredStorySchema.safeParse(songRequest.structured_story);
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', `história estruturada inválida no pedido ${order.id}`, {
      retryable: false,
    });
  }

  return { songRequest, story: parsed.data };
}

/**
 * Reserva a geração.
 *
 * Devolve null quando já existe uma geração READY (nada a fazer) ou quando
 * outro processo acabou de criar a mesma geração. Uma geração QUEUED órfã é
 * reaproveitada — é o caso do retry de job.
 */
async function claimGeneration(
  order: OrderRow,
  type: GenerationType,
  input: { prompt: string; lyrics: string; maxAttempts: number },
): Promise<GenerationRow | null> {
  const alive = await findAliveGeneration(order.id, type);

  if (alive?.status === 'READY') {
    logger.info('generation.already_ready', { order_id: order.id, generation_id: alive.id, type });
    return null;
  }

  if (alive) {
    if (alive.attempt_count >= alive.max_attempts) {
      await cancelAliveGenerations(order.id, type, 'tentativas esgotadas');
      throw new AppError('PROVIDER_ERROR', `geração ${type} esgotou as tentativas`, {
        retryable: false,
      });
    }
    return alive;
  }

  const provider = await getMusicProvider();

  try {
    return await insertGeneration({
      orderId: order.id,
      type,
      provider: provider.name,
      model: provider.model,
      operation: type === 'PREVIEW' ? 'generatePreview' : 'generateFullSong',
      prompt: input.prompt,
      lyrics: input.lyrics,
      maxAttempts: input.maxAttempts,
    });
  } catch (error) {
    // CONFLICT aqui significa corrida com outro worker: o outro venceu.
    if (error instanceof AppError && error.code === 'CONFLICT') {
      logger.info('generation.race_lost', { order_id: order.id, type });
      return null;
    }
    throw error;
  }
}

async function runGeneration(args: {
  order: OrderRow;
  songRequest: SongRequestRow;
  story: StructuredStory;
  generation: GenerationRow;
  type: GenerationType;
  targetDurationSeconds: number;
}): Promise<void> {
  const { order, story, generation, type, targetDurationSeconds } = args;
  const provider = await getMusicProvider();
  const storage = getStorageProvider();

  await updateGeneration(generation.id, {
    status: 'RUNNING',
    started_at: new Date().toISOString(),
    attempt_count: generation.attempt_count + 1,
    provider: provider.name,
    model: provider.model,
  });

  const input = {
    generationId: generation.id,
    orderId: order.id,
    prompt: buildPrompt(order, story),
    lyrics: type === 'PREVIEW' ? story.preview_hook : story.lyrics,
    sections: type === 'FULL' ? buildSections(order, story, targetDurationSeconds) : undefined,
    targetDurationSeconds,
  };

  try {
    const result =
      type === 'PREVIEW'
        ? await provider.generatePreview(input)
        : await provider.generateFullSong(input);

    if (result.kind === 'pending') {
      // Nenhum provider ativo hoje é assíncrono, mas a fila já sabe lidar:
      // o job volta a rodar e consulta o status pelo id do provider.
      await updateGeneration(generation.id, {
        provider_generation_id: result.providerGenerationId,
        estimated_cost: result.estimatedCostUsd,
      });
      throw new AppError('PROVIDER_ERROR', 'geração assíncrona ainda em andamento', {
        retryable: true,
      });
    }

    const extension = result.audio.mimeType.includes('wav') ? 'wav' : 'mp3';
    const path = `orders/${order.id}/${type.toLowerCase()}-${generation.id}.${extension}`;

    const stored = await storage.upload(path, result.audio.data, result.audio.mimeType);

    await updateGeneration(generation.id, {
      status: 'READY',
      provider_generation_id: result.providerGenerationId,
      storage_path: stored.path,
      audio_mime_type: stored.mimeType,
      audio_size_bytes: stored.sizeBytes,
      duration_seconds: result.audio.durationSeconds,
      estimated_cost: result.estimatedCostUsd,
      actual_cost: result.estimatedCostUsd,
      model: result.model,
      finished_at: new Date().toISOString(),
      error_message: null,
    });

    await recordOrderEvent({
      orderId: order.id,
      eventType: type === 'PREVIEW' ? 'preview_generated' : 'full_song_generated',
      message: type === 'PREVIEW' ? 'Prévia gerada' : 'Música completa gerada',
      metadata: {
        generation_id: generation.id,
        provider: provider.name,
        model: result.model,
        duration_seconds: result.audio.durationSeconds,
        size_bytes: stored.sizeBytes,
        estimated_cost_usd: result.estimatedCostUsd,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof AppError ? error.retryable : true;
    const attempts = generation.attempt_count + 1;
    const exhausted = !retryable || attempts >= generation.max_attempts;

    await updateGeneration(generation.id, {
      status: exhausted ? 'FAILED' : 'QUEUED',
      error_message: message.slice(0, 2000),
      ...(exhausted ? { finished_at: new Date().toISOString() } : {}),
    });

    await recordOrderEvent({
      orderId: order.id,
      eventType: 'generation_failed',
      message: `Falha ao gerar ${type === 'PREVIEW' ? 'a prévia' : 'a música completa'}`,
      metadata: { generation_id: generation.id, attempts, error: message.slice(0, 500) },
    });

    if (exhausted) {
      await updateOrder(order.id, { last_error_message: message.slice(0, 500) });
      await advanceOrderStatus({ id: order.id, status: order.status }, 'FAILED', {
        message: 'Geração falhou após todas as tentativas',
      });
      await enqueueJob({
        type: 'SEND_NOTIFICATION',
        orderId: order.id,
        dedupeKey: `notify:generation_failed:${order.id}:${generation.id}`,
        payload: { event_type: 'generation_failed' },
      });
    }

    throw error;
  }
}

/** Prompt musical final: o do LLM, reforçado com estilo e clima do pedido. */
export function buildPrompt(order: OrderRow, story: StructuredStory): string {
  return [
    story.music_generation_prompt,
    `Estilo: ${styleHint(order.music_style)}.`,
    `Clima: ${story.emotional_tone.toLowerCase()}.`,
    'Idioma: português do Brasil.',
    'Não imitar artistas específicos.',
  ].join(' ');
}

/**
 * Converte a estrutura devolvida pelo LLM em seções com duração.
 *
 * Os pesos distribuem a duração alvo dando mais espaço aos refrões, que é onde
 * mora o gancho da música. Cada seção fica entre 3 e 120 segundos, respeitando
 * o limite do provider.
 */
export function buildSections(
  order: OrderRow,
  story: StructuredStory,
  targetDurationSeconds: number,
): MusicSection[] {
  // `instrumental` marca a seção que NÃO deve ser cantada. A introdução que o
  // modelo de texto devolve é uma descrição de arranjo ("violão dedilhado,
  // entrada suave da voz") — mandá-la como letra faria o motor musical cantar
  // essa frase. Ela vira instrução de estilo, não texto cantado.
  const weights: Array<{
    key: keyof StructuredStory['song_structure'];
    weight: number;
    instrumental?: boolean;
  }> = [
    { key: 'intro', weight: 0.08, instrumental: true },
    { key: 'verse_1', weight: 0.2 },
    { key: 'chorus', weight: 0.22 },
    { key: 'verse_2', weight: 0.18 },
    { key: 'bridge', weight: 0.12 },
    { key: 'final_chorus', weight: 0.2 },
  ];

  const positive = [
    styleHint(order.music_style),
    story.emotional_tone.toLowerCase(),
    'vocais em português brasileiro',
  ];
  const negative = ['imitação de artista específico', 'ruído', 'distorção agressiva'];

  return weights.map(({ key, weight, instrumental }) => ({
    text: instrumental ? '' : story.song_structure[key],
    durationSeconds: Math.min(Math.max(Math.round(targetDurationSeconds * weight), 3), 120),
    positiveStyles: instrumental
      ? [...positive, 'introdução instrumental', story.song_structure[key].slice(0, 120)]
      : positive,
    negativeStyles: instrumental ? [...negative, 'vocais'] : negative,
  }));
}
