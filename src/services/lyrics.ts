import { songStructureSchema, type SongStructure, type StructuredStory } from '@/schemas/story';

/**
 * Letra efetivamente cantada.
 *
 * O modelo de texto devolve a letra DUAS vezes: em `lyrics`, já formatada, e em
 * `song_structure`, seção por seção. Quem vai para o motor musical é a segunda
 * — os chunks do plano de composição são montados a partir dela. Exibir a
 * primeira significava mostrar ao cliente um texto que não é o que ele ouve.
 *
 * Esta função monta a letra a partir da MESMA fonte que o áudio usa, para que
 * as duas não possam divergir. A introdução fica de fora porque é instrumental:
 * o texto dela é descrição de arranjo, não algo cantado.
 */
const SUNG_SECTIONS: Array<{ key: keyof SongStructure; label: string }> = [
  { key: 'verse_1', label: 'Verso 1' },
  { key: 'chorus', label: 'Refrão' },
  { key: 'verse_2', label: 'Verso 2' },
  { key: 'bridge', label: 'Ponte' },
  { key: 'final_chorus', label: 'Refrão Final' },
];

export function assembleSungLyrics(story: StructuredStory | { song_structure: SongStructure }): string {
  return assembleFromStructure(story.song_structure);
}

function assembleFromStructure(structure: SongStructure): string {
  return SUNG_SECTIONS.filter(({ key }) => structure[key].trim().length > 0)
    .map(({ key, label }) => `[${label}]\n${structure[key].trim()}`)
    .join('\n\n');
}

/**
 * Letra para exibir ao cliente.
 *
 * Deriva da estrutura sempre que ela existir — inclusive em pedidos criados
 * antes desta correção, porque `structured_story` já era gravada. Só recorre ao
 * campo `lyrics` quando não há estrutura.
 */
export function displayLyrics(
  structuredStory: unknown,
  storedLyrics: string | null,
): string | null {
  const structure = extractStructure(structuredStory);
  if (!structure) return storedLyrics;

  const assembled = assembleFromStructure(structure);
  return assembled.trim().length > 0 ? assembled : storedLyrics;
}

/**
 * Valida SOMENTE `song_structure`.
 *
 * Exigir que a história inteira passasse no schema tornava a derivação refém de
 * campos que nada têm a ver com a letra: um `music_direction` curto demais em um
 * pedido antigo bastaria para voltarmos a exibir o texto desalinhado.
 */
function extractStructure(value: unknown): SongStructure | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = (value as { song_structure?: unknown }).song_structure;
  const result = songStructureSchema.safeParse(candidate);

  return result.success ? result.data : null;
}
