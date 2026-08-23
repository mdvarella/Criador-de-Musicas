import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
import { logProviderChoice } from '../resolution-log';
import { ElevenLabsMusicProvider } from './elevenlabs-provider';
import { MockMusicProvider } from './mock-provider';
import type { MusicGenerationProvider } from './types';

export type {
  GeneratedAudio,
  GenerationResult,
  GenerationStatus,
  MusicGenerationInput,
  MusicGenerationProvider,
  MusicSection,
} from './types';
export { ElevenLabsMusicProvider } from './elevenlabs-provider';
export { MockMusicProvider, synthesizeWav } from './mock-provider';

export async function getMusicProvider(): Promise<MusicGenerationProvider> {
  const settings = await getSettings();

  if (serverEnv().USE_MOCK_PROVIDERS) {
    logProviderChoice('music', 'mock', 'USE_MOCK_PROVIDERS');
    return new MockMusicProvider();
  }

  switch (settings.active_music_provider) {
    case 'mock':
      logProviderChoice('music', 'mock', 'configuração active_*_provider');
      return new MockMusicProvider();
    case 'elevenlabs':
      logProviderChoice('music', 'elevenlabs', 'provider configurado');
      return new ElevenLabsMusicProvider({
        costPerMinuteUsd: settings.music_cost_per_minute_usd,
      });
    default:
      throw new Error(`MusicGenerationProvider desconhecido: ${settings.active_music_provider}`);
  }
}
