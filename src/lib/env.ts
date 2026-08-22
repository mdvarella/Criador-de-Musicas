import { z } from 'zod';

/**
 * Variáveis públicas.
 *
 * O Next.js só substitui `process.env.NEXT_PUBLIC_*` quando a expressão aparece
 * literalmente no código — por isso cada uma é lida de forma explícita aqui.
 */
const publicEnvSchema = z.object({
  appUrl: z.url().default('http://localhost:3000'),
  brandName: z.string().min(1).default('Minha Música IA'),
  brandTagline: z.string().min(1).default('Transforme sua história em uma música única.'),
  supportEmail: z.string().default(''),
  supportWhatsapp: z.string().default(''),
  supabaseUrl: z.string().default(''),
  supabaseAnonKey: z.string().default(''),
  mercadoPagoPublicKey: z.string().default(''),
  metaPixelId: z.string().default(''),
  gaMeasurementId: z.string().default(''),
  tiktokPixelId: z.string().default(''),
});

export const publicEnv = publicEnvSchema.parse({
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME || 'Minha Música IA',
  brandTagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Transforme sua história em uma música única.',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
  supportWhatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  mercadoPagoPublicKey: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || '',
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || '',
  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '',
  tiktokPixelId: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || '',
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Variáveis de servidor. Nenhuma delas pode ser importada por Client Components:
 * o acesso é lazy e falha explicitamente caso alguma rota tente usar um segredo
 * que não foi configurado.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('songs'),

  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-5.1'),
  OPENAI_BASE_URL: z.string().default(''),

  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_MUSIC_MODEL: z.string().default('music_v2'),
  ELEVENLABS_OUTPUT_FORMAT: z.string().default('mp3_44100_128'),

  MERCADO_PAGO_ACCESS_TOKEN: z.string().default(''),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().default(''),

  NOTIFICATION_EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().default(''),
  NOTIFICATION_EMAIL_FROM: z.string().default('Minha Música IA <nao-responda@localhost>'),

  MEDIA_SIGNING_SECRET: z.string().default(''),
  JOBS_WORKER_SECRET: z.string().default(''),
  ADMIN_ALLOWED_EMAILS: z.string().default(''),

  USE_MOCK_PROVIDERS: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() não pode ser chamado no browser.');
  }

  cachedServerEnv = serverEnvSchema.parse(process.env);
  return cachedServerEnv;
}

/** Usado apenas nos testes, para reavaliar `process.env`. */
export function resetServerEnvCache(): void {
  cachedServerEnv = null;
}

/**
 * Falha cedo e com mensagem clara quando um segredo obrigatório não existe.
 * Preferimos quebrar na inicialização do provider a quebrar no meio do pedido.
 */
export function requireEnv(key: keyof ServerEnv): string {
  const value = serverEnv()[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${key}. Configure-a antes de usar esta integração.`,
    );
  }
  return value;
}

export function adminAllowedEmails(): string[] {
  return serverEnv()
    .ADMIN_ALLOWED_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isProduction(): boolean {
  return serverEnv().NODE_ENV === 'production';
}
