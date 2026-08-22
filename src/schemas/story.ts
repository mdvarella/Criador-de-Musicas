import { z } from 'zod';

/**
 * Contrato da saída do LLM (item 8 da especificação).
 *
 * Nada que o modelo devolve é aceito sem passar por aqui. Se um campo faltar ou
 * vier com formato errado, o job falha e é reprocessado — nunca seguimos para a
 * geração musical com um objeto meio formado.
 */

export const songStructureSchema = z.object({
  intro: z.string().max(1200),
  verse_1: z.string().max(2000),
  chorus: z.string().max(2000),
  verse_2: z.string().max(2000),
  bridge: z.string().max(2000),
  final_chorus: z.string().max(2000),
});

export const structuredStorySchema = z.object({
  recipient: z.object({
    name: z.string().min(1).max(80),
    relationship: z.string().min(1).max(60),
  }),
  occasion: z.string().min(1).max(80),
  story_summary: z.string().min(10).max(1200),
  important_facts: z.array(z.string().max(300)).max(20),
  mandatory_phrases: z.array(z.string().max(200)).max(5),
  emotional_tone: z.string().min(1).max(60),
  music_style: z.string().min(1).max(80),
  voice_preference: z.string().min(1).max(40),
  song_structure: songStructureSchema,
  lyrics: z.string().min(80).max(6000),
  music_generation_prompt: z.string().min(20).max(1200),
  /** Direção musical resumida (andamento, instrumentação, dinâmica). */
  music_direction: z.string().min(10).max(1200),
  /** Trecho curto e emocional que a prévia deve destacar. */
  preview_hook: z.string().min(10).max(600),
});

export type StructuredStory = z.infer<typeof structuredStorySchema>;
export type SongStructure = z.infer<typeof songStructureSchema>;

/**
 * JSON Schema equivalente, exigido pela Structured Output da OpenAI.
 * Mantido lado a lado com o schema Zod de propósito: a OpenAI garante a forma,
 * o Zod garante os limites e é a única validação em que confiamos.
 */
export const structuredStoryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'recipient',
    'occasion',
    'story_summary',
    'important_facts',
    'mandatory_phrases',
    'emotional_tone',
    'music_style',
    'voice_preference',
    'song_structure',
    'lyrics',
    'music_generation_prompt',
    'music_direction',
    'preview_hook',
  ],
  properties: {
    recipient: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'relationship'],
      properties: {
        name: { type: 'string' },
        relationship: { type: 'string' },
      },
    },
    occasion: { type: 'string' },
    story_summary: { type: 'string' },
    important_facts: { type: 'array', items: { type: 'string' } },
    mandatory_phrases: { type: 'array', items: { type: 'string' } },
    emotional_tone: { type: 'string' },
    music_style: { type: 'string' },
    voice_preference: { type: 'string' },
    song_structure: {
      type: 'object',
      additionalProperties: false,
      required: ['intro', 'verse_1', 'chorus', 'verse_2', 'bridge', 'final_chorus'],
      properties: {
        intro: { type: 'string' },
        verse_1: { type: 'string' },
        chorus: { type: 'string' },
        verse_2: { type: 'string' },
        bridge: { type: 'string' },
        final_chorus: { type: 'string' },
      },
    },
    lyrics: { type: 'string' },
    music_generation_prompt: { type: 'string' },
    music_direction: { type: 'string' },
    preview_hook: { type: 'string' },
  },
} as const;
