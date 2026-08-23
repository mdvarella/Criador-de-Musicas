import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
import { logProviderChoice } from '../resolution-log';
import { MockLLMProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';
import type { LLMProvider } from './types';

export type { LLMProvider, LLMResult, StoryInterpretationInput } from './types';
export { MockLLMProvider } from './mock-provider';
export { OpenAIProvider, parseStructuredStory } from './openai-provider';

/**
 * Escolhe o provider de texto ativo.
 *
 * A decisão é de configuração (`active_llm_provider`), não de código. Em
 * desenvolvimento, `USE_MOCK_PROVIDERS=true` força o mock e evita gasto.
 */
export async function getLLMProvider(): Promise<LLMProvider> {
  const settings = await getSettings();

  if (serverEnv().USE_MOCK_PROVIDERS) {
    logProviderChoice('llm', 'mock', 'USE_MOCK_PROVIDERS');
    return new MockLLMProvider();
  }

  switch (settings.active_llm_provider) {
    case 'mock':
      logProviderChoice('llm', 'mock', 'configuração active_*_provider');
      return new MockLLMProvider();
    case 'openai':
      logProviderChoice('llm', 'openai', 'provider configurado');
      return new OpenAIProvider({
        costPerMillionInputUsd: settings.llm_cost_per_1m_input_tokens_usd,
        costPerMillionOutputUsd: settings.llm_cost_per_1m_output_tokens_usd,
      });
    default:
      throw new Error(`LLMProvider desconhecido: ${settings.active_llm_provider}`);
  }
}
