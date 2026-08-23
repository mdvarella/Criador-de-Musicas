import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvCache } from '@/lib/env';
import { DEFAULT_SETTINGS, type AppSettings } from '@/services/settings-service';

/**
 * Resolução dos providers.
 *
 * Este arquivo existe por causa de um incidente concreto: uma chave repetida no
 * `.env.local` fez `USE_MOCK_PROVIDERS` valer `true` sem ninguém perceber, e
 * TODAS as gerações saíram em mock — com custo zero e áudio sintetizado —
 * enquanto o banco dizia `active_music_provider = elevenlabs`.
 *
 * A regra que estes testes protegem: com `USE_MOCK_PROVIDERS=false` e
 * `active_music_provider = elevenlabs`, o sistema JAMAIS pode devolver o mock.
 */

let settings: AppSettings;

vi.mock('@/services/settings-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings-service')>(
    '@/services/settings-service',
  );
  return { ...actual, getSettings: async () => settings };
});

const { getMusicProvider } = await import('@/providers/music');
const { getLLMProvider } = await import('@/providers/llm');
const { getPaymentProvider } = await import('@/providers/payment');
const { MockMusicProvider } = await import('@/providers/music/mock-provider');
const { ElevenLabsMusicProvider } = await import('@/providers/music/elevenlabs-provider');

function setEnv(useMock: boolean) {
  process.env.USE_MOCK_PROVIDERS = String(useMock);
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.OPENAI_API_KEY = 'chave-de-teste';
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'chave-de-teste';
  resetServerEnvCache();
}

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS };
});

describe('provider musical', () => {
  it('NUNCA resolve mock com USE_MOCK_PROVIDERS=false e active_music_provider=elevenlabs', async () => {
    setEnv(false);
    settings.active_music_provider = 'elevenlabs';

    const provider = await getMusicProvider();

    expect(provider).toBeInstanceOf(ElevenLabsMusicProvider);
    expect(provider).not.toBeInstanceOf(MockMusicProvider);
    expect(provider.name).toBe('elevenlabs');
    expect(provider.model).not.toBe('mock-composer-1');
  });

  it('USE_MOCK_PROVIDERS=true tem precedência sobre a configuração do banco', async () => {
    setEnv(true);
    settings.active_music_provider = 'elevenlabs';

    const provider = await getMusicProvider();

    // É a chave geral: verdadeira, ignora o banco de propósito.
    expect(provider).toBeInstanceOf(MockMusicProvider);
  });

  it('mock continua selecionável pela configuração, com a chave geral desligada', async () => {
    setEnv(false);
    settings.active_music_provider = 'mock';

    expect(await getMusicProvider()).toBeInstanceOf(MockMusicProvider);
  });

  it('provider desconhecido falha alto, sem cair em mock silenciosamente', async () => {
    setEnv(false);
    settings.active_music_provider = 'suno';

    await expect(getMusicProvider()).rejects.toThrow(/desconhecido/);
  });

  it('a ausência da chave da API não faz cair em mock — falha explicitamente', async () => {
    setEnv(false);
    settings.active_music_provider = 'elevenlabs';
    process.env.ELEVENLABS_API_KEY = '';
    resetServerEnvCache();

    await expect(getMusicProvider()).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe('demais providers seguem a mesma regra', () => {
  it('LLM resolve openai quando configurado e a chave geral está desligada', async () => {
    setEnv(false);
    settings.active_llm_provider = 'openai';

    const provider = await getLLMProvider();

    expect(provider.name).toBe('openai');
    expect(provider.model).not.toBe('mock-lyricist-1');
  });

  it('pagamento resolve mercadopago quando configurado', async () => {
    setEnv(false);
    settings.active_payment_provider = 'mercadopago';

    expect((await getPaymentProvider()).name).toBe('mercadopago');
  });

  it('um serviço em mock não arrasta os outros', async () => {
    // O cenário exato da integração incremental: música real, pagamento em mock.
    setEnv(false);
    settings.active_music_provider = 'elevenlabs';
    settings.active_payment_provider = 'mock';
    settings.active_llm_provider = 'openai';

    expect((await getMusicProvider()).name).toBe('elevenlabs');
    expect((await getPaymentProvider()).name).toBe('mock');
    expect((await getLLMProvider()).name).toBe('openai');
  });
});
