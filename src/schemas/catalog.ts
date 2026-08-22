/**
 * Catálogos do produto.
 *
 * Ficam em um único lugar porque são usados por três consumidores: os selects
 * do formulário, a validação Zod do servidor e o prompt do LLM. O `value` é o
 * que persiste no banco; o `label` é o que o cliente lê.
 */

export type CatalogOption = {
  value: string;
  label: string;
  /** Dica curta usada em cards e no prompt do LLM. */
  hint?: string;
  emoji?: string;
};

export const RELATIONSHIPS: CatalogOption[] = [
  { value: 'NAMORADA', label: 'Namorada' },
  { value: 'NAMORADO', label: 'Namorado' },
  { value: 'ESPOSA', label: 'Esposa' },
  { value: 'MARIDO', label: 'Marido' },
  { value: 'MAE', label: 'Mãe' },
  { value: 'PAI', label: 'Pai' },
  { value: 'FILHO', label: 'Filho' },
  { value: 'FILHA', label: 'Filha' },
  { value: 'AMIGO', label: 'Amigo' },
  { value: 'AMIGA', label: 'Amiga' },
  { value: 'PET', label: 'Pet' },
  { value: 'OUTRO', label: 'Outro' },
];

export const OCCASIONS: CatalogOption[] = [
  { value: 'PRESENTE_ROMANTICO', label: 'Presente romântico', emoji: '❤️' },
  { value: 'ANIVERSARIO', label: 'Aniversário', emoji: '🎂' },
  { value: 'ANIVERSARIO_NAMORO', label: 'Aniversário de namoro', emoji: '💞' },
  { value: 'ANIVERSARIO_CASAMENTO', label: 'Aniversário de casamento', emoji: '💍' },
  { value: 'PEDIDO_NAMORO', label: 'Pedido de namoro', emoji: '🌹' },
  { value: 'PEDIDO_CASAMENTO', label: 'Pedido de casamento', emoji: '💎' },
  { value: 'CASAMENTO', label: 'Casamento', emoji: '👰' },
  { value: 'HOMENAGEM', label: 'Homenagem', emoji: '🕊️' },
  { value: 'DIA_DAS_MAES', label: 'Dia das Mães', emoji: '💐' },
  { value: 'DIA_DOS_PAIS', label: 'Dia dos Pais', emoji: '🧡' },
  { value: 'AMIZADE', label: 'Amizade', emoji: '🤝' },
  { value: 'FILHOS', label: 'Filhos', emoji: '👶' },
  { value: 'PET', label: 'Pet', emoji: '🐾' },
  { value: 'OUTRA', label: 'Outra', emoji: '✨' },
];

export const MUSIC_STYLES: CatalogOption[] = [
  { value: 'ROMANTICA', label: 'Romântica', hint: 'balada romântica brasileira, melódica' },
  { value: 'POP', label: 'Pop', hint: 'pop contemporâneo, refrão marcante' },
  { value: 'SERTANEJO_ROMANTICO', label: 'Sertanejo romântico', hint: 'sertanejo, viola e voz' },
  { value: 'ACUSTICA', label: 'Acústica', hint: 'violão, arranjo intimista' },
  { value: 'MPB', label: 'MPB', hint: 'MPB, violão e percussão suave' },
  { value: 'PAGODE_ROMANTICO', label: 'Pagode romântico', hint: 'pagode, cavaquinho e percussão' },
  { value: 'ROCK_LEVE', label: 'Rock leve', hint: 'rock suave, guitarra limpa' },
  { value: 'GOSPEL', label: 'Gospel', hint: 'gospel contemporâneo, piano e coral' },
  { value: 'FORRO', label: 'Forró', hint: 'forró, sanfona, triângulo e zabumba' },
  { value: 'PIANO_E_VOZ', label: 'Piano e voz', hint: 'piano solo com voz principal' },
  { value: 'SURPRESA', label: 'Surpresa — deixe a criação livre', hint: 'estilo livre' },
];

export const EMOTIONAL_TONES: CatalogOption[] = [
  { value: 'EMOCIONANTE', label: 'Emocionante' },
  { value: 'ROMANTICO', label: 'Romântico' },
  { value: 'ALEGRE', label: 'Alegre' },
  { value: 'DIVERTIDO', label: 'Divertido' },
  { value: 'EPICO', label: 'Épico' },
  { value: 'DELICADO', label: 'Delicado' },
  { value: 'SAUDOSO', label: 'Saudoso' },
  { value: 'INSPIRADOR', label: 'Inspirador' },
];

export const VOICE_PREFERENCES: CatalogOption[] = [
  { value: 'MASCULINA', label: 'Voz masculina' },
  { value: 'FEMININA', label: 'Voz feminina' },
  { value: 'SURPRESA', label: 'Surpresa' },
];

function values(options: CatalogOption[]): [string, ...string[]] {
  return options.map((o) => o.value) as [string, ...string[]];
}

export const RELATIONSHIP_VALUES = values(RELATIONSHIPS);
export const OCCASION_VALUES = values(OCCASIONS);
export const MUSIC_STYLE_VALUES = values(MUSIC_STYLES);
export const EMOTIONAL_TONE_VALUES = values(EMOTIONAL_TONES);
export const VOICE_PREFERENCE_VALUES = values(VOICE_PREFERENCES);

const LABELS = new Map<string, string>(
  [
    ...RELATIONSHIPS,
    ...OCCASIONS,
    ...MUSIC_STYLES,
    ...EMOTIONAL_TONES,
    ...VOICE_PREFERENCES,
  ].map((o) => [o.value, o.label]),
);

export function labelFor(value: string | null | undefined): string {
  if (!value) return '—';
  return LABELS.get(value) ?? value;
}

export function styleHint(value: string): string {
  return MUSIC_STYLES.find((s) => s.value === value)?.hint ?? 'estilo livre';
}
