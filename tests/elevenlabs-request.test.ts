import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvCache } from '@/lib/env';
import { ElevenLabsMusicProvider } from '@/providers/music/elevenlabs-provider';
import type { MusicGenerationInput } from '@/providers/music/types';

/**
 * Trava o CORPO da requisição enviada à Eleven Music.
 *
 * Existe porque o campo do plano já foi enviado com o nome errado (`sections`
 * em vez de `chunks`, mais campos de estilo global que não existem). Os testes
 * antigos verificavam a forma dos chunks, mas nunca o invólucro — então o erro
 * só apareceria na primeira cobrança real, com HTTP 422.
 */

let lastRequest: { url: string; body: Record<string, unknown>; headers: Headers } | null = null;

function stubFetch(status = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    lastRequest = {
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: new Headers(init?.headers as HeadersInit),
    };

    return new Response(status === 200 ? new Uint8Array([1, 2, 3, 4]) : null, {
      status,
      headers: { 'content-type': 'audio/mpeg' },
    });
  });
}

const input: MusicGenerationInput = {
  generationId: 'gen-1',
  orderId: 'order-1',
  prompt: 'balada romântica brasileira, violão e cordas suaves',
  lyrics: '[Refrão]\nMarina, é você que faz o meu tempo valer',
  targetDurationSeconds: 15,
  sections: [
    { text: '', durationSeconds: 12, positiveStyles: ['violão dedilhado'], negativeStyles: ['vocais'] },
    {
      text: '[Verso 1]\nFoi assim que tudo começou',
      durationSeconds: 30,
      positiveStyles: ['balada romântica'],
      negativeStyles: ['imitação de artista específico'],
    },
  ],
};

describe('corpo da requisição à Eleven Music', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
    process.env.ELEVENLABS_MUSIC_MODEL = 'music_v2';
    process.env.ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';
    resetServerEnvCache();
    lastRequest = null;
    vi.stubGlobal('fetch', stubFetch());
  });

  it('usa o endpoint e o header de autenticação documentados', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    await provider.generatePreview(input);

    expect(lastRequest?.url).toBe('https://api.elevenlabs.io/v1/music');
    expect(lastRequest?.headers.get('xi-api-key')).toBe('chave-de-teste');
  });

  it('prévia usa prompt e music_length_ms, nunca composition_plan', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    await provider.generatePreview(input);

    const body = lastRequest!.body;
    expect(typeof body.prompt).toBe('string');
    expect(body.music_length_ms).toBe(15_000);
    expect(body.model_id).toBe('music_v2');
    expect(body.force_instrumental).toBe(false);
    // prompt e composition_plan são mutuamente exclusivos na API.
    expect(body).not.toHaveProperty('composition_plan');
  });

  it('música completa envia composition_plan com o campo `chunks`', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    await provider.generateFullSong(input);

    const plan = lastRequest!.body.composition_plan as Record<string, unknown>;

    expect(plan).toBeDefined();
    expect(Array.isArray(plan.chunks)).toBe(true);
    expect((plan.chunks as unknown[]).length).toBe(2);

    // O nome errado que já esteve em produção não pode voltar.
    expect(plan).not.toHaveProperty('sections');
    // Estilos globais não existem no nível do plano.
    expect(plan).not.toHaveProperty('positive_global_styles');
    expect(plan).not.toHaveProperty('negative_global_styles');
    // prompt e composition_plan são mutuamente exclusivos.
    expect(lastRequest!.body).not.toHaveProperty('prompt');
  });

  it('cada chunk respeita os limites documentados', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    await provider.generateFullSong(input);

    const chunks = (lastRequest!.body.composition_plan as { chunks: Array<Record<string, unknown>> })
      .chunks;

    for (const chunk of chunks) {
      expect(typeof chunk.text).toBe('string');
      expect(chunk.duration_ms as number).toBeGreaterThanOrEqual(3_000);
      expect(chunk.duration_ms as number).toBeLessThanOrEqual(120_000);
      expect((chunk.positive_styles as string[]).length).toBeLessThanOrEqual(50);
      expect((chunk.negative_styles as string[]).length).toBeLessThanOrEqual(50);
    }
  });

  it('só a seção com letra pede aderência alta ao texto', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    await provider.generateFullSong(input);

    const chunks = (lastRequest!.body.composition_plan as { chunks: Array<Record<string, unknown>> })
      .chunks;

    expect(chunks[0]!.text).toBe('');
    expect(chunks[0]).not.toHaveProperty('context_adherence');
    expect(chunks[1]!.context_adherence).toBe('high');
  });

  it('estima o custo pela duração pedida', async () => {
    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });
    const result = await provider.generatePreview(input);

    // 15 segundos a $0,15/min = $0,0375
    expect(result.estimatedCostUsd).toBeCloseTo(0.0375, 4);
  });

  it('erro de conteúdo protegido não é reprocessado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: { status: 'bad_prompt', message: 'copyright' } }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const provider = new ElevenLabsMusicProvider({ costPerMinuteUsd: 0.15 });

    // Repetir a mesma chamada não passaria: falha permanente, não transitória.
    await expect(provider.generatePreview(input)).rejects.toMatchObject({ retryable: false });
  });
});
