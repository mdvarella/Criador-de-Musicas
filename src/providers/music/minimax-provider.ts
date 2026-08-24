import 'server-only';
import { AppError } from '@/lib/errors';
import { requireEnv, serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type {
  GenerationResult,
  GenerationStatus,
  MusicGenerationInput,
  MusicGenerationProvider,
} from './types';

/**
 * MusicGenerationProvider sobre o MiniMax Music, hospedado na fal.
 *
 * Contrato extraído das definições de tipo do cliente oficial `@fal-ai/client`
 * (`MinimaxMusicV2Input` / `DiaOutput`), não de exemplo de blog:
 *
 *   entrada  { prompt: string           // estilo, clima e cenário — 10 a 300 caracteres
 *            , lyrics_prompt: string    // letra com marcadores [Verse], [Chorus] — 10 a 3000
 *            , audio_setting?: { bitrate, channel, format, sample_rate } }
 *
 *   saída    { audio: { url: string, content_type?, file_size? } }
 *
 * Autenticação pelo header `Authorization: Key <FAL_KEY>`.
 *
 * LIMITAÇÕES REGISTRADAS
 *   1. NÃO há controle de duração. O modelo decide o tamanho a partir da letra,
 *      então `full_song_duration_seconds` não tem efeito aqui — e uma "prévia"
 *      sairia com tamanho de música inteira. Por isso existe o provider
 *      separado de prévia (ver `active_preview_music_provider`).
 *   2. O `prompt` tem teto de 300 caracteres, bem menor que o da ElevenLabs.
 *      A direção musical é condensada antes de ser enviada.
 *   3. A resposta devolve uma URL, não os bytes: baixamos o arquivo antes de
 *      guardá-lo no nosso bucket privado, para não depender do host deles.
 *   4. A duração real não vem na resposta. Ela é ESTIMADA a partir do tamanho
 *      do arquivo e do bitrate pedido.
 */

const PROMPT_MAX = 300;
const LYRICS_MIN = 10;
const LYRICS_MAX = 3000;
const BITRATE = 128_000;

type MinimaxOutput = {
  audio?: { url?: string; content_type?: string; file_size?: number };
};

export class MinimaxMusicProvider implements MusicGenerationProvider {
  readonly name = 'minimax';
  readonly model: string;
  readonly supportsAsyncStatus = false;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly costPerGenerationUsd: number;

  constructor(options: { costPerGenerationUsd: number; model?: string }) {
    const env = serverEnv();
    this.apiKey = requireEnv('FAL_KEY');
    this.model = options.model ?? env.MINIMAX_MUSIC_MODEL;
    this.baseUrl = env.FAL_BASE_URL.replace(/\/$/, '');
    this.costPerGenerationUsd = options.costPerGenerationUsd;
  }

  async generatePreview(input: MusicGenerationInput): Promise<GenerationResult> {
    logger.warn('minimax.preview_without_duration_control', {
      generation_id: input.generationId,
      order_id: input.orderId,
      requested_seconds: input.targetDurationSeconds,
    });

    return this.compose(input, input.lyrics);
  }

  async generateFullSong(input: MusicGenerationInput): Promise<GenerationResult> {
    return this.compose(input, input.lyrics);
  }

  async getGenerationStatus(_id: string): Promise<GenerationStatus> {
    throw new AppError(
      'PROVIDER_ERROR',
      'Esta integração usa a chamada síncrona da fal e não expõe consulta por id. ' +
        'Use supportsAsyncStatus para decidir antes de chamar este método.',
      { retryable: false },
    );
  }

  private async compose(
    input: MusicGenerationInput,
    lyrics: string,
  ): Promise<GenerationResult> {
    const body = {
      prompt: condensePrompt(input.prompt),
      lyrics_prompt: prepareLyrics(lyrics),
      audio_setting: {
        format: 'mp3' as const,
        bitrate: String(BITRATE) as '128000',
        sample_rate: '44100' as const,
        channel: '2' as const,
      },
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${this.model}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
    } catch (error) {
      throw new AppError('PROVIDER_ERROR', `falha de rede ao chamar o MiniMax: ${String(error)}`, {
        retryable: true,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AppError(
        'PROVIDER_ERROR',
        `MiniMax respondeu ${response.status}: ${detail.slice(0, 400)}`,
        // 4xx é problema do nosso payload: insistir não resolve.
        { retryable: response.status >= 500 || response.status === 429 },
      );
    }

    const result = (await response.json()) as MinimaxOutput;
    const url = result.audio?.url;

    if (!url) {
      throw new AppError('PROVIDER_ERROR', 'MiniMax não devolveu a URL do áudio', {
        retryable: true,
      });
    }

    const audio = await this.download(url, result.audio?.content_type);

    logger.info('music.composed', {
      provider: this.name,
      generation_id: input.generationId,
      order_id: input.orderId,
      bytes: audio.data.byteLength,
    });

    return {
      kind: 'completed',
      providerGenerationId: null,
      audio,
      model: this.model,
      estimatedCostUsd: this.costPerGenerationUsd,
    };
  }

  /**
   * Baixa o áudio para o nosso lado.
   *
   * A URL da fal é temporária. Guardar apenas a referência deixaria a música do
   * cliente dependendo do host deles — o arquivo precisa acabar no nosso bucket.
   */
  private async download(url: string, contentType?: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(2 * 60 * 1000) });

    if (!response.ok) {
      throw new AppError('PROVIDER_ERROR', `falha ao baixar o áudio do MiniMax (${response.status})`, {
        retryable: true,
      });
    }

    const data = new Uint8Array(await response.arrayBuffer());

    if (data.byteLength === 0) {
      throw new AppError('PROVIDER_ERROR', 'MiniMax devolveu um áudio vazio', { retryable: true });
    }

    return {
      data,
      mimeType: contentType || response.headers.get('content-type') || 'audio/mpeg',
      // A resposta não informa duração; estimamos pelo tamanho e pelo bitrate.
      durationSeconds: Number(((data.byteLength * 8) / BITRATE).toFixed(1)),
    };
  }
}

/**
 * Condensa a direção musical no teto de 300 caracteres da API.
 *
 * Corta em vírgula ou ponto para não entregar uma frase pela metade, que
 * confundiria o modelo mais do que ajudaria.
 */
export function condensePrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  if (clean.length <= PROMPT_MAX) return clean;

  const cut = clean.slice(0, PROMPT_MAX);
  const lastBreak = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('. '));

  return lastBreak > PROMPT_MAX * 0.5 ? cut.slice(0, lastBreak) : cut.trimEnd();
}

/**
 * Ajusta a letra aos limites da API.
 *
 * Nossos marcadores em português ([Verso 1], [Refrão]) são traduzidos para os
 * que a documentação da API cita, porque são eles que o modelo reconhece como
 * estrutura da canção.
 */
export function prepareLyrics(lyrics: string): string {
  const translated = lyrics
    .replace(/\[Verso\s*\d*\]/gi, '[Verse]')
    .replace(/\[Refrão\s*Final\]/gi, '[Chorus]')
    .replace(/\[Refrão\]/gi, '[Chorus]')
    .replace(/\[Ponte\]/gi, '[Bridge]')
    .replace(/\[Intro\]/gi, '[Intro]')
    .trim();

  if (translated.length < LYRICS_MIN) {
    throw new AppError('PROVIDER_ERROR', 'letra curta demais para o MiniMax (mínimo 10 caracteres)', {
      retryable: false,
    });
  }

  return translated.slice(0, LYRICS_MAX);
}
