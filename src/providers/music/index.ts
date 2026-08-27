import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
import { logProviderChoice } from '../resolution-log';
import { ElevenLabsMusicProvider } from './elevenlabs-provider';
import { MinimaxMusicProvider } from './minimax-provider';
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
export { MinimaxMusicProvider } from './minimax-provider';
export { MockMusicProvider, synthesizeWav } from './mock-provider';

const KNOWN_MUSIC_PROVIDERS = ['elevenlabs', 'minimax', 'mock'] as const;

/**
 * Escolhe o provider musical.
 *
 * `type` existe porque prévia e música completa podem vir de providers
 * diferentes: nem todo motor controla duração, e uma prévia do tamanho da
 * música inteira entregaria o produto sem cobrar. Quando
 * `active_preview_music_provider` está vazio, os dois usam o mesmo.
 */
export async function getMusicProvider(
  type: 'PREVIEW' | 'FULL' = 'FULL',
): Promise<MusicGenerationProvider> {
  const settings = await getSettings();

  if (serverEnv().USE_MOCK_PROVIDERS) {
    logProviderChoice('music', 'mock', 'USE_MOCK_PROVIDERS');
    return new MockMusicProvider();
  }

  const configured =
    type === 'PREVIEW' && settings.active_preview_music_provider
      ? settings.active_preview_music_provider
      : settings.active_music_provider;

  switch (configured) {
    case 'mock':
      logProviderChoice('music', 'mock', 'configuração active_*_provider');
      return new MockMusicProvider();
    case 'elevenlabs':
      logProviderChoice('music', 'elevenlabs', 'provider configurado');
      return new ElevenLabsMusicProvider({
        costPerMinuteUsd: settings.music_cost_per_minute_usd,
      });
    case 'minimax':
      logProviderChoice('music', 'minimax', 'provider configurado');
      return new MinimaxMusicProvider({
        costPerGenerationUsd: settings.minimax_cost_per_generation_usd,
      });
    default:
      // A causa quase sempre é uma das duas: o nome foi digitado errado no
      // Supabase, ou o processo que roda a fila subiu antes do provider existir
      // no código (`npm run jobs:work` não recarrega sozinho).
      throw new Error(
        `MusicGenerationProvider desconhecido: "${configured}". ` +
          `Valores aceitos: ${KNOWN_MUSIC_PROVIDERS.join(', ')}. ` +
          'Confira active_music_provider em app_settings e reinicie o worker da fila.',
      );
  }
}
