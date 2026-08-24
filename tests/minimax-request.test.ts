import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvCache } from '@/lib/env';
import { MinimaxMusicProvider, condensePrompt, prepareLyrics } from '@/providers/music/minimax-provider';
import type { MusicGenerationInput } from '@/providers/music/types';

/**
 * Trava o corpo enviado ao MiniMax.
 *
 * Existe pelo mesmo motivo do teste equivalente da ElevenLabs: o corpo daquele
 * provider foi escrito com nomes de campo inventados e só falharia na primeira
 * cobrança real. Os nomes aqui vêm das definições de tipo do cliente oficial
 * (`MinimaxMusicV2Input`), e este teste impede que se percam.
 */

let lastRequest: { url: string; body: Record<string, unknown>; headers: Headers } | null = null;

const AUDIO_URL = 'https://storage.exemplo/musica.mp3';

function stubFal() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);

      // Segunda chamada: o download do arquivo gerado.
      if (href === AUDIO_URL) {
        return new Response(new Uint8Array(160_000), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }

      lastRequest = {
        url: href,
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        headers: new Headers(init?.headers as HeadersInit),
      };

      return new Response(
        JSON.stringify({ audio: { url: AUDIO_URL, content_type: 'audio/mpeg' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
}

const input: MusicGenerationInput = {
  generationId: 'gen-1',
  orderId: 'order-1',
  prompt: 'balada romântica brasileira, violão e cordas suaves, clima emocionante',
  lyrics: '[Verso 1]\nFoi numa festa junina\n\n[Refrão]\nMarina, é você\n\n[Ponte]\nE se um dia',
  targetDurationSeconds: 150,
};

beforeEach(() => {
  process.env.FAL_KEY = 'chave-de-teste';
  process.env.MINIMAX_MUSIC_MODEL = 'fal-ai/minimax-music/v2';
  process.env.FAL_BASE_URL = 'https://fal.run';
  resetServerEnvCache();
  lastRequest = null;
  stubFal();
});

describe('corpo da requisição ao MiniMax', () => {
  it('usa o endpoint do modelo e o header de autenticação documentados', async () => {
    await new MinimaxMusicProvider({ costPerGenerationUsd: 0.03 }).generateFullSong(input);

    expect(lastRequest?.url).toBe('https://fal.run/fal-ai/minimax-music/v2');
    expect(lastRequest?.headers.get('Authorization')).toBe('Key chave-de-teste');
  });

  it('envia `prompt` e `lyrics_prompt`, os nomes do cliente oficial', async () => {
    await new MinimaxMusicProvider({ costPerGenerationUsd: 0.03 }).generateFullSong(input);

    const body = lastRequest!.body;
    expect(typeof body.prompt).toBe('string');
    expect(typeof body.lyrics_prompt).toBe('string');

    // Nomes de outros providers não podem vazar para cá.
    expect(body).not.toHaveProperty('lyrics');
    expect(body).not.toHaveProperty('composition_plan');
    expect(body).not.toHaveProperty('music_length_ms');
  });

  it('pede mp3 estéreo em qualidade razoável', async () => {
    await new MinimaxMusicProvider({ costPerGenerationUsd: 0.03 }).generateFullSong(input);

    expect(lastRequest!.body.audio_setting).toEqual({
      format: 'mp3',
      bitrate: '128000',
      sample_rate: '44100',
      channel: '2',
    });
  });

  it('baixa o áudio em vez de guardar a URL temporária deles', async () => {
    const result = await new MinimaxMusicProvider({ costPerGenerationUsd: 0.03 }).generateFullSong(
      input,
    );

    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') return;

    expect(result.audio.data.byteLength).toBe(160_000);
    expect(result.audio.mimeType).toBe('audio/mpeg');
    // 160.000 bytes a 128 kbps ≈ 10 segundos.
    expect(result.audio.durationSeconds).toBeCloseTo(10, 0);
    expect(result.estimatedCostUsd).toBe(0.03);
  });

  it('erro 4xx não é reprocessado: o payload é que está errado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('campo inválido', { status: 422 })),
    );

    await expect(
      new MinimaxMusicProvider({ costPerGenerationUsd: 0.03 }).generateFullSong(input),
    ).rejects.toMatchObject({ retryable: false });
  });
});

describe('adaptações aos limites da API', () => {
  it('respeita o teto de 300 caracteres do prompt', () => {
    const longo = 'balada romântica brasileira, '.repeat(40);
    const condensado = condensePrompt(longo);

    expect(condensado.length).toBeLessThanOrEqual(300);
    // Corta em vírgula: frase pela metade confunde o modelo.
    expect(condensado.endsWith('romântica brasileira')).toBe(true);
  });

  it('deixa prompts curtos intactos', () => {
    expect(condensePrompt('  balada  romântica  ')).toBe('balada romântica');
  });

  it('traduz os marcadores de seção para os que a API reconhece', () => {
    const preparada = prepareLyrics(input.lyrics);

    expect(preparada).toContain('[Verse]');
    expect(preparada).toContain('[Chorus]');
    expect(preparada).toContain('[Bridge]');
    expect(preparada).not.toContain('[Verso');
    expect(preparada).not.toContain('[Refrão');
    expect(preparada).not.toContain('[Ponte]');
  });

  it('recusa letra curta demais em vez de deixar a API rejeitar', () => {
    expect(() => prepareLyrics('oi')).toThrow(/curta demais/);
  });

  it('trunca letra acima do teto de 3000 caracteres', () => {
    expect(prepareLyrics('a'.repeat(5000)).length).toBe(3000);
  });
});
