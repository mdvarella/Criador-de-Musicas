import { z } from 'zod';
import {
  EMOTIONAL_TONE_VALUES,
  MUSIC_STYLE_VALUES,
  OCCASION_VALUES,
  RELATIONSHIP_VALUES,
  VOICE_PREFERENCE_VALUES,
} from './catalog';

/**
 * Validação do formulário de criação.
 *
 * O mesmo schema roda no cliente (feedback imediato) e no servidor (fonte de
 * verdade). Todos os limites de tamanho existem também por segurança: entrada
 * longa demais vira custo de LLM e superfície de abuso.
 */

const trimmed = (min: number, max: number, message: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(min, message).max(max, `Máximo de ${max} caracteres.`));

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => v.trim())
    .optional()
    .or(z.literal('').transform(() => undefined));

export const STORY_MIN_LENGTH = 30;
export const STORY_MAX_LENGTH = 8000;

export const specialDetailsSchema = z.object({
  city: optionalText(120),
  importantDate: optionalText(60),
  nickname: optionalText(120),
  children: optionalText(300),
  specialPlaces: optionalText(300),
  otherDetails: optionalText(1000),
});

export type SpecialDetails = z.infer<typeof specialDetailsSchema>;

export const songFormSchema = z.object({
  // Passo 1 — para quem é a música
  recipientName: trimmed(1, 80, 'Conte para quem é a música.'),
  relationship: z.enum(RELATIONSHIP_VALUES, { message: 'Escolha a relação.' }),
  relationshipOther: optionalText(60),

  // Passo 2 — ocasião
  occasion: z.enum(OCCASION_VALUES, { message: 'Escolha a ocasião.' }),
  occasionOther: optionalText(60),

  // Passo 3 — história
  story: trimmed(
    STORY_MIN_LENGTH,
    STORY_MAX_LENGTH,
    'Conte um pouco mais da história (mínimo de 30 caracteres).',
  ),

  // Passo 4 — detalhes especiais (todos opcionais)
  specialDetails: specialDetailsSchema.default({}),
  mandatoryPhrase: optionalText(200),

  // Passos 5 a 7 — estilo, voz e clima
  musicStyle: z.enum(MUSIC_STYLE_VALUES, { message: 'Escolha o estilo musical.' }),
  voicePreference: z.enum(VOICE_PREFERENCE_VALUES).default('SURPRESA'),
  emotionalTone: z.enum(EMOTIONAL_TONE_VALUES, { message: 'Escolha o clima da música.' }),
});

export type SongFormValues = z.infer<typeof songFormSchema>;

export const customerSchema = z.object({
  firstName: trimmed(2, 60, 'Informe seu primeiro nome.'),
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.email('Informe um e-mail válido.')),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(
      z
        .string()
        .min(10, 'Informe o WhatsApp com DDD.')
        .max(13, 'Número de WhatsApp inválido.'),
    ),
  acceptedTerms: z.literal(true, {
    message: 'É necessário aceitar os termos de uso e a política de privacidade.',
  }),
  marketingOptIn: z.boolean().default(false),
});

export type CustomerValues = z.infer<typeof customerSchema>;

export const attributionSchema = z.object({
  utm_source: optionalText(120),
  utm_medium: optionalText(120),
  utm_campaign: optionalText(160),
  utm_content: optionalText(160),
  utm_term: optionalText(160),
  fbclid: optionalText(255),
  ttclid: optionalText(255),
  gclid: optionalText(255),
  landing_path: optionalText(255),
  referrer: optionalText(500),
});

export type Attribution = z.infer<typeof attributionSchema>;

export const createOrderSchema = z.object({
  song: songFormSchema,
  customer: customerSchema,
  attribution: attributionSchema.default({}),
  anonymousId: optionalText(64),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
