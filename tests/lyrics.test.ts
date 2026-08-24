import { describe, expect, it } from 'vitest';
import { assembleSungLyrics, displayLyrics } from '@/services/lyrics';
import type { StructuredStory } from '@/schemas/story';

/**
 * Letra exibida x letra cantada.
 *
 * O modelo de texto devolve a letra duas vezes: em `lyrics`, já formatada, e em
 * `song_structure`, seção por seção. Quem vira áudio é a segunda. Exibíamos a
 * primeira — e o cliente recebia um texto que não correspondia ao que ouvia.
 */
const story = {
  recipient: { name: 'Marina', relationship: 'Namorada' },
  occasion: 'Aniversário',
  story_summary: 'Se conheceram numa festa junina em Campinas e nunca mais se separaram.',
  important_facts: [],
  mandatory_phrases: [],
  emotional_tone: 'Romântico',
  music_style: 'Romântica',
  voice_preference: 'Surpresa',
  song_structure: {
    intro: 'Violão dedilhado, entrada suave da voz',
    verse_1: 'Foi numa festa junina que eu te vi',
    chorus: 'Marina, é você que faz o meu tempo valer',
    verse_2: 'O tempo passou e a gente aprendeu a ficar',
    bridge: 'E se um dia o caminho apertar',
    final_chorus: 'Marina, é você que faz o meu tempo valer',
  },
  lyrics: '[Intro]\nOutra coisa completamente diferente\n\n[Verso 1]\nTexto que ninguém canta',
  music_generation_prompt: 'balada romântica',
  music_direction: 'Andamento moderado.',
  preview_hook: 'Marina, é você que faz o meu tempo valer.',
} as StructuredStory;

describe('montagem da letra cantada', () => {
  it('usa a estrutura, não o campo `lyrics` escrito à parte', () => {
    const assembled = assembleSungLyrics(story);

    expect(assembled).toContain('Foi numa festa junina que eu te vi');
    expect(assembled).not.toContain('Texto que ninguém canta');
  });

  it('deixa a introdução de fora: ela é instrumental', () => {
    // O texto da intro é descrição de arranjo, não algo cantado — e o chunk
    // correspondente vai com `text` vazio para o motor musical.
    expect(assembleSungLyrics(story)).not.toContain('Violão dedilhado');
  });

  it('mantém a ordem das seções e rotula cada uma', () => {
    const assembled = assembleSungLyrics(story);
    const labels = [...assembled.matchAll(/\[(.+?)\]/g)].map((match) => match[1]);

    expect(labels).toEqual(['Verso 1', 'Refrão', 'Verso 2', 'Ponte', 'Refrão Final']);
  });

  it('omite seções vazias em vez de deixar rótulo órfão', () => {
    const semPonte = {
      ...story,
      song_structure: { ...story.song_structure, bridge: '   ' },
    } as StructuredStory;

    expect(assembleSungLyrics(semPonte)).not.toContain('[Ponte]');
  });
});

describe('letra exibida ao cliente', () => {
  it('deriva da estrutura, corrigindo inclusive pedidos antigos', () => {
    // `structured_story` já era gravada antes desta correção, então a letra
    // exibida de um pedido antigo passa a bater com o áudio sem regerar nada.
    const shown = displayLyrics(story, 'letra antiga desalinhada');

    expect(shown).toContain('Foi numa festa junina que eu te vi');
    expect(shown).not.toContain('letra antiga desalinhada');
  });

  it('recorre à letra gravada quando não há estrutura válida', () => {
    expect(displayLyrics(null, 'letra gravada')).toBe('letra gravada');
    expect(displayLyrics({ lixo: true }, 'letra gravada')).toBe('letra gravada');
  });

  it('não inventa letra quando não há nada', () => {
    expect(displayLyrics(null, null)).toBeNull();
  });
});
