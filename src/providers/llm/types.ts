import type { StructuredStory } from '@/schemas/story';

/**
 * Contrato do provider de texto.
 *
 * A regra de negócio conhece apenas esta interface. Trocar OpenAI por outro
 * modelo é escrever uma nova classe e mudar `active_llm_provider` no banco.
 */

export type StoryInterpretationInput = {
  recipientName: string;
  relationship: string;
  occasion: string;
  story: string;
  specialDetails: Record<string, string | undefined>;
  mandatoryPhrase?: string;
  musicStyle: string;
  musicStyleHint: string;
  voicePreference: string;
  emotionalTone: string;
  /** Duração alvo da música completa, em segundos. */
  targetDurationSeconds: number;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LLMResult = {
  story: StructuredStory;
  usage: LLMUsage;
  model: string;
  provider: string;
  estimatedCostUsd: number;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  interpretStory(input: StoryInterpretationInput): Promise<LLMResult>;
}
