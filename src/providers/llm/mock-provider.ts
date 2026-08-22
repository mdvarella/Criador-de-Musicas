import { structuredStorySchema, type StructuredStory } from '@/schemas/story';
import type { LLMProvider, LLMResult, StoryInterpretationInput } from './types';

/**
 * Provider de texto para desenvolvimento, testes e seed.
 *
 * Produz uma letra plausível sem gastar crédito e sem depender de rede, o que
 * permite rodar o fluxo comercial inteiro localmente.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-lyricist-1';

  async interpretStory(input: StoryInterpretationInput): Promise<LLMResult> {
    const name = input.recipientName;
    const chorus = [
      `${name}, é você que faz o meu tempo valer`,
      'Cada dia comum virou história pra contar',
      `${name}, se o mundo girar sem parar`,
      'Eu escolho de novo ficar'
    ].join('\n');

    const story: StructuredStory = structuredStorySchema.parse({
      recipient: { name, relationship: input.relationship },
      occasion: input.occasion,
      story_summary: input.story.slice(0, 400),
      important_facts: input.story
        .split(/[.!?\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 12)
        .slice(0, 6),
      mandatory_phrases: input.mandatoryPhrase ? [input.mandatoryPhrase] : [],
      emotional_tone: input.emotionalTone,
      music_style: input.musicStyle,
      voice_preference: input.voicePreference,
      song_structure: {
        intro: 'Violão dedilhado, entrada suave da voz.',
        verse_1: `Foi assim que tudo começou com ${name}`,
        chorus,
        verse_2: 'O tempo passou e a gente aprendeu a ficar',
        bridge: 'E se um dia o caminho apertar',
        final_chorus: chorus,
      },
      lyrics: [
        '[Intro]',
        'Violão dedilhado, entrada suave da voz',
        '',
        '[Verso 1]',
        `Foi assim que tudo começou com ${name}`,
        'Um encontro comum que virou lugar de voltar',
        '',
        '[Refrão]',
        chorus,
        '',
        '[Verso 2]',
        'O tempo passou e a gente aprendeu a ficar',
        'Nos dias difíceis, nos dias de rir sem parar',
        '',
        '[Ponte]',
        'E se um dia o caminho apertar',
        'Eu seguro sua mão pra gente atravessar',
        '',
        '[Refrão Final]',
        chorus,
      ].join('\n'),
      music_generation_prompt: `${input.musicStyleHint}, clima ${input.emotionalTone.toLowerCase()}, voz ${input.voicePreference.toLowerCase()} em português brasileiro, andamento moderado, violão e cordas suaves`,
      music_direction:
        'Andamento aproximado de 76 BPM, violão base, cordas discretas no refrão, dinâmica crescente até o refrão final.',
      preview_hook: `${name}, é você que faz o meu tempo valer. Cada dia comum virou história pra contar.`,
    });

    return {
      story,
      usage: { inputTokens: 900, outputTokens: 700, totalTokens: 1600 },
      model: this.model,
      provider: this.name,
      estimatedCostUsd: 0,
    };
  }
}
