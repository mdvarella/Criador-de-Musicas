import 'server-only';
import { AppError } from '@/lib/errors';
import { requireEnv, serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type {
  GenerationResult,
  GenerationStatus,
  MusicGenerationInput,
  MusicGenerationProvider,
  MusicSection,
} from './types';

/**
 * MusicGenerationProvider sobre a Eleven Music API.
 *
 * Endpoints usados (verificados na referência oficial da API):
 *   POST /v1/music                    -> compõe e devolve o áudio na resposta
 *   POST /v1/music/composition_plan   -> gera um plano estruturado (não usado
 *                                        no MVP: montamos o plano nós mesmos a
 *                                        partir da estrutura devolvida pelo LLM)
 *
 * Parâmetros aceitos por POST /v1/music: `prompt` OU `composition_plan`
 * (mutuamente exclusivos), `music_length_ms` (3.000 a 600.000),
 * `model_id`, `force_instrumental`, `output_format`.
 * Autenticação pelo header `xi-api-key`.
 *
 * LIMITAÇÕES REGISTRADAS (item 41 da especificação):
 *   1. A composição é SÍNCRONA: o áudio volta no corpo da resposta e não existe
 *      endpoint de consulta de status por id. Por isso `supportsAsyncStatus` é
 *      false e `getGenerationStatus` não é suportado. A fila trata a geração
 *      como concluída assim que a chamada retorna.
 *   2. A API não devolve custo por requisição. O custo registrado é uma
 *      ESTIMATIVA calculada a partir da duração gerada e da configuração
 *      `music_cost_per_minute_usd`.
 *   3. A API não devolve a duração exata do áudio; usamos a duração solicitada.
 *   4. Não há seleção de voz por gênero na API de música. A preferência de voz
 *      do cliente é comunicada dentro do prompt/estilos, sem garantia dura.
 *   5. Cada chunk do composition_plan aceita de 3s a 120s, com no máximo 30
 *      chunks — o montador abaixo respeita esses limites.
 */

const API_BASE = 'https://api.elevenlabs.io';
const MIN_LENGTH_MS = 3_000;
const MAX_LENGTH_MS = 600_000;
const MIN_SECTION_MS = 3_000;
const MAX_SECTION_MS = 120_000;
const MAX_SECTIONS = 30;

type ElevenLabsCompositionChunk = {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  /** Quanto o modelo deve aderir ao texto da seção. */
  context_adherence?: 'low' | 'medium' | 'high';
};

export class ElevenLabsMusicProvider implements MusicGenerationProvider {
  readonly name = 'elevenlabs';
  readonly model: string;
  readonly supportsAsyncStatus = false;

  private readonly apiKey: string;
  private readonly outputFormat: string;
  private readonly costPerMinuteUsd: number;

  constructor(options: { costPerMinuteUsd: number; model?: string }) {
    const env = serverEnv();
    this.apiKey = requireEnv('ELEVENLABS_API_KEY');
    this.model = options.model ?? env.ELEVENLABS_MUSIC_MODEL;
    this.outputFormat = env.ELEVENLABS_OUTPUT_FORMAT;
    this.costPerMinuteUsd = options.costPerMinuteUsd;
  }

  /**
   * Prévia: trecho curto, gerado a partir de um prompt único.
   * O plano estruturado não compensa aqui — são poucos segundos de música.
   */
  async generatePreview(input: MusicGenerationInput): Promise<GenerationResult> {
    const lengthMs = clamp(input.targetDurationSeconds * 1000, MIN_LENGTH_MS, MAX_LENGTH_MS);

    const audio = await this.compose(
      {
        prompt: buildPreviewPrompt(input),
        music_length_ms: lengthMs,
        model_id: this.model,
        output_format: this.outputFormat,
        force_instrumental: input.instrumental ?? false,
      },
      input,
    );

    return {
      kind: 'completed',
      providerGenerationId: null,
      audio: { ...audio, durationSeconds: lengthMs / 1000 },
      model: this.model,
      estimatedCostUsd: this.estimateCost(lengthMs / 1000),
    };
  }

  /**
   * Música completa: usa composition_plan para controlar seção a seção qual
   * letra é cantada, por quanto tempo e com qual instrumentação.
   */
  async generateFullSong(input: MusicGenerationInput): Promise<GenerationResult> {
    const sections = input.sections?.length
      ? input.sections
      : [
          {
            text: input.lyrics,
            durationSeconds: input.targetDurationSeconds,
            positiveStyles: [input.prompt],
            negativeStyles: [],
          },
        ];

    const chunks = buildCompositionChunks(sections);
    const totalMs = chunks.reduce((sum, chunk) => sum + chunk.duration_ms, 0);

    const audio = await this.compose(
      {
        // O plano tem UM campo: `chunks`. Não existem estilos globais no nível
        // do plano — o estilo é declarado por chunk.
        composition_plan: { chunks },
        model_id: this.model,
        output_format: this.outputFormat,
      },
      input,
    );

    return {
      kind: 'completed',
      providerGenerationId: null,
      audio: { ...audio, durationSeconds: totalMs / 1000 },
      model: this.model,
      estimatedCostUsd: this.estimateCost(totalMs / 1000),
    };
  }

  async getGenerationStatus(_providerGenerationId: string): Promise<GenerationStatus> {
    throw new AppError(
      'PROVIDER_ERROR',
      'A Eleven Music API é síncrona e não expõe consulta de status por id. ' +
        'Use supportsAsyncStatus para decidir antes de chamar este método.',
      { retryable: false },
    );
  }

  private estimateCost(durationSeconds: number): number {
    return Number(((durationSeconds / 60) * this.costPerMinuteUsd).toFixed(6));
  }

  private async compose(
    body: Record<string, unknown>,
    input: MusicGenerationInput,
  ): Promise<{ data: Uint8Array; mimeType: string; durationSeconds: number }> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${API_BASE}/v1/music`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
    } catch (error) {
      throw new AppError('PROVIDER_ERROR', `falha de rede ao chamar a Eleven Music: ${String(error)}`, {
        retryable: true,
      });
    }

    if (!response.ok) {
      throw await toProviderError(response);
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      throw new AppError('PROVIDER_ERROR', 'Eleven Music devolveu um áudio vazio', {
        retryable: true,
      });
    }

    logger.info('music.composed', {
      provider: this.name,
      generation_id: input.generationId,
      order_id: input.orderId,
      bytes: buffer.byteLength,
      duration_ms_request: Date.now() - startedAt,
    });

    return {
      data: buffer,
      mimeType: response.headers.get('content-type') ?? 'audio/mpeg',
      durationSeconds: input.targetDurationSeconds,
    };
  }
}

/**
 * Traduz o erro da API para um AppError, distinguindo o que vale reprocessar.
 * `bad_prompt` e `bad_composition_plan` indicam conteúdo protegido por direitos
 * autorais: repetir a mesma chamada não vai passar, então não é retryable.
 */
async function toProviderError(response: Response): Promise<AppError> {
  let detail = '';
  let code = '';
  try {
    const body = (await response.json()) as { detail?: { status?: string; message?: string } };
    code = body?.detail?.status ?? '';
    detail = body?.detail?.message ?? '';
  } catch {
    detail = await response.text().catch(() => '');
  }

  const permanent = code === 'bad_prompt' || code === 'bad_composition_plan' || response.status === 401;

  return new AppError(
    'PROVIDER_ERROR',
    `Eleven Music respondeu ${response.status}${code ? ` (${code})` : ''}: ${detail.slice(0, 400)}`,
    { retryable: !permanent && response.status !== 422 },
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Converte as seções do domínio nos chunks aceitos pela API, respeitando os
 * limites documentados (3s a 120s por seção, no máximo 30 seções).
 */
export function buildCompositionChunks(sections: MusicSection[]): ElevenLabsCompositionChunk[] {
  return sections.slice(0, MAX_SECTIONS).map((section) => {
    const text = section.text.trim().slice(0, 2000);

    return {
      text,
      duration_ms: clamp(section.durationSeconds * 1000, MIN_SECTION_MS, MAX_SECTION_MS),
      positive_styles: section.positiveStyles.filter(Boolean).slice(0, 50),
      negative_styles: section.negativeStyles.filter(Boolean).slice(0, 50),
      // Seção com letra precisa ser cantada como está escrita; seção
      // instrumental não tem texto a que aderir.
      ...(text ? { context_adherence: 'high' as const } : {}),
    };
  });
}

export function buildPreviewPrompt(input: MusicGenerationInput): string {
  return [
    input.prompt,
    'Trecho curto e emocionante, começando direto no gancho principal.',
    'Letra a ser cantada:',
    input.lyrics.slice(0, 800),
  ].join('\n');
}
