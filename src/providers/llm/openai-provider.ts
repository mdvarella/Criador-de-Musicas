import 'server-only';
import OpenAI from 'openai';
import { AppError } from '@/lib/errors';
import { requireEnv, serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { structuredStoryJsonSchema, structuredStorySchema } from '@/schemas/story';
import { STORY_SYSTEM_PROMPT, buildStoryUserPrompt } from './prompts';
import type { LLMProvider, LLMResult, StoryInterpretationInput } from './types';

/**
 * Implementação do LLMProvider sobre a Responses API da OpenAI.
 *
 * Usa Structured Outputs (`text.format = json_schema`, strict) para que o
 * modelo devolva JSON com a forma correta, e ainda assim revalida tudo com Zod
 * antes de qualquer uso — a especificação é explícita: nunca confiar em JSON
 * livre.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;

  private readonly client: OpenAI;
  private readonly costPerMillionInputUsd: number;
  private readonly costPerMillionOutputUsd: number;

  constructor(options: {
    costPerMillionInputUsd: number;
    costPerMillionOutputUsd: number;
    model?: string;
  }) {
    const env = serverEnv();
    this.model = options.model ?? env.OPENAI_MODEL;
    this.costPerMillionInputUsd = options.costPerMillionInputUsd;
    this.costPerMillionOutputUsd = options.costPerMillionOutputUsd;

    this.client = new OpenAI({
      apiKey: requireEnv('OPENAI_API_KEY'),
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      maxRetries: 2,
      timeout: 120_000,
    });
  }

  async interpretStory(input: StoryInterpretationInput): Promise<LLMResult> {
    let raw: string;
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          { role: 'system', content: STORY_SYSTEM_PROMPT },
          { role: 'user', content: buildStoryUserPrompt(input) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'structured_story',
            strict: true,
            schema: structuredStoryJsonSchema as unknown as Record<string, unknown>,
          },
        },
      });

      raw = response.output_text ?? '';
      usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    } catch (error) {
      throw new AppError('PROVIDER_ERROR', `falha na chamada ao LLM: ${String(error)}`, {
        retryable: true,
      });
    }

    const story = parseStructuredStory(raw);

    logger.info('llm.story_interpreted', {
      provider: this.name,
      model: this.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });

    return {
      story,
      usage,
      model: this.model,
      provider: this.name,
      estimatedCostUsd: this.estimateCost(usage.inputTokens, usage.outputTokens),
    };
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    const input = (inputTokens / 1_000_000) * this.costPerMillionInputUsd;
    const output = (outputTokens / 1_000_000) * this.costPerMillionOutputUsd;
    return Number((input + output).toFixed(6));
  }
}

/**
 * Faz o parse e a validação da resposta do modelo.
 *
 * Exportada separadamente para poder ser testada sem rede: é aqui que mora o
 * risco de aceitar um objeto inválido.
 */
export function parseStructuredStory(raw: string) {
  if (!raw || !raw.trim()) {
    throw new AppError('PROVIDER_ERROR', 'LLM devolveu resposta vazia', { retryable: true });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new AppError('PROVIDER_ERROR', 'LLM devolveu um JSON inválido', { retryable: true });
  }

  const result = structuredStorySchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      'PROVIDER_ERROR',
      `saída do LLM reprovada na validação: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      { retryable: true },
    );
  }

  return result.data;
}

/** Alguns modelos ainda devolvem o JSON dentro de um bloco ```json. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}
