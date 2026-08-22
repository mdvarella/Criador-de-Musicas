import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { parseStructuredStory } from '@/providers/llm/openai-provider';
import { MockLLMProvider } from '@/providers/llm/mock-provider';

const validStory = {
  recipient: { name: 'Marina', relationship: 'Namorada' },
  occasion: 'Aniversário de namoro',
  story_summary: 'Se conheceram em uma festa junina em Campinas e nunca mais se separaram.',
  important_facts: ['Festa junina em Campinas', 'Dançaram a noite inteira'],
  mandatory_phrases: [],
  emotional_tone: 'Romântico',
  music_style: 'Romântica',
  voice_preference: 'Surpresa',
  song_structure: {
    intro: 'Violão dedilhado',
    verse_1: 'Verso um',
    chorus: 'Refrão',
    verse_2: 'Verso dois',
    bridge: 'Ponte',
    final_chorus: 'Refrão final',
  },
  lyrics: 'a'.repeat(120),
  music_generation_prompt: 'balada romântica brasileira com violão e cordas suaves',
  music_direction: 'Andamento de 76 BPM, violão base e cordas no refrão.',
  preview_hook: 'Marina, é você que faz o meu tempo valer.',
};

describe('parsing da resposta do modelo de texto', () => {
  it('aceita uma resposta válida', () => {
    const parsed = parseStructuredStory(JSON.stringify(validStory));
    expect(parsed.recipient.name).toBe('Marina');
    expect(parsed.song_structure.chorus).toBe('Refrão');
  });

  it('aceita a resposta embrulhada em bloco de código', () => {
    const raw = '```json\n' + JSON.stringify(validStory) + '\n```';
    expect(parseStructuredStory(raw).occasion).toBe('Aniversário de namoro');
  });

  it('recusa resposta vazia', () => {
    expect(() => parseStructuredStory('')).toThrow(AppError);
    expect(() => parseStructuredStory('   ')).toThrow(AppError);
  });

  it('recusa JSON malformado', () => {
    expect(() => parseStructuredStory('{"recipient": ')).toThrow(AppError);
  });

  it('recusa objeto com campo faltando', () => {
    const { lyrics, ...incomplete } = validStory;
    void lyrics;
    expect(() => parseStructuredStory(JSON.stringify(incomplete))).toThrow(AppError);
  });

  it('recusa letra curta demais para virar música', () => {
    const raw = JSON.stringify({ ...validStory, lyrics: 'curta' });
    expect(() => parseStructuredStory(raw)).toThrow(AppError);
  });

  it('marca a falha como reprocessável', () => {
    try {
      parseStructuredStory('não é json');
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).retryable).toBe(true);
      // A mensagem técnica jamais vaza para o consumidor.
      expect((error as AppError).userMessage).not.toContain('JSON');
    }
  });
});

describe('provider de texto simulado', () => {
  it('produz uma história estruturada válida com a frase obrigatória', async () => {
    const provider = new MockLLMProvider();
    const result = await provider.interpretStory({
      recipientName: 'Marina',
      relationship: 'Namorada',
      occasion: 'Aniversário',
      story: 'Nos conhecemos em uma viagem. Foi tudo muito rápido e muito bonito.',
      specialDetails: {},
      mandatoryPhrase: 'você é meu lugar favorito',
      musicStyle: 'Romântica',
      musicStyleHint: 'balada romântica',
      voicePreference: 'Feminina',
      emotionalTone: 'Emocionante',
      targetDurationSeconds: 150,
    });

    expect(result.story.mandatory_phrases).toContain('você é meu lugar favorito');
    expect(result.story.lyrics).toContain('Marina');
    expect(result.estimatedCostUsd).toBe(0);
  });
});
