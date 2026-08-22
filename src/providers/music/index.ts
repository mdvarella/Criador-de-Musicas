import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
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

  if (serverEnv().USE_MOCK_PROVIDERS || settings.active_music_provider === 'mock') {
    return new MockMusicProvider();
  }

  switch (settings.active_music_provider) {
    case 'elevenlabs':
      return new ElevenLabsMusicProvider({
        costPerMinuteUsd: settings.music_cost_per_minute_usd,
      });
    default:
      throw new Error(`MusicGenerationProvider desconhecido: ${settings.active_music_provider}`);
  }
}
