import 'server-only';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Configurações operacionais (item 29 da especificação).
 *
 * Nenhum valor de negócio fica espalhado pelo código: preço, duração da prévia,
 * provider ativo e modo de manutenção vêm daqui. A tabela `app_settings` é a
 * fonte de verdade; os defaults abaixo existem para que a aplicação suba mesmo
 * antes da primeira migration rodar.
 */

/**
 * Nome de provider vindo do banco.
 *
 * Normaliza porque o valor é digitado à mão no Supabase: "MiniMax", " minimax"
 * ou "minimax " são a mesma escolha, e antes qualquer um desses derrubava a
 * geração com "MusicGenerationProvider desconhecido".
 */
function providerName(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((value) => value.trim().toLowerCase());
}

export const settingsSchema = z.object({
  product_price_cents: z.number().int().min(0).default(4990),
  product_price_premium_cents: z.number().int().min(0).default(9990),
  available_plans: z.array(z.string()).default(['STANDARD']),
  preview_enabled: z.boolean().default(true),
  preview_duration_seconds: z.number().int().min(5).max(60).default(15),
  full_song_duration_seconds: z.number().int().min(30).max(600).default(150),
  active_music_provider: providerName('elevenlabs'),
  /**
   * Provider da PRÉVIA, quando precisa ser diferente do da música completa.
   * Vazio significa "o mesmo". Existe porque nem todo provider controla
   * duração: o MiniMax decide o tamanho sozinho, e uma prévia com tamanho de
   * música inteira entregaria o produto de graça.
   */
  active_preview_music_provider: providerName(''),
  active_llm_provider: providerName('openai'),
  active_payment_provider: providerName('mercadopago'),
  max_generation_attempts: z.number().int().min(1).max(10).default(3),
  maintenance_mode: z.boolean().default(false),
  payment_methods: z.array(z.string()).default(['pix', 'card']),
  llm_cost_per_1m_input_tokens_usd: z.number().min(0).default(1.25),
  llm_cost_per_1m_output_tokens_usd: z.number().min(0).default(10),
  music_cost_per_minute_usd: z.number().min(0).default(0.3),
  /** O MiniMax cobra por geração, não por minuto. */
  minimax_cost_per_generation_usd: z.number().min(0).default(0.03),
  payment_fee_percent: z.number().min(0).max(100).default(4.99),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

const CACHE_TTL_MS = 30_000;
let cache: { value: AppSettings; expiresAt: number } | null = null;

export async function getSettings(options: { fresh?: boolean } = {}): Promise<AppSettings> {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  // Tudo aqui é tolerante a falha, inclusive a ausência de credenciais durante o
  // build: configuração indisponível cai nos defaults em vez de derrubar a loja.
  let data: Array<{ key: string; value: unknown }> | null = null;

  try {
    const result = await supabaseAdmin().from('app_settings').select('key, value');
    if (result.error) throw new Error(result.error.message);
    data = result.data;
  } catch (error) {
    logger.warn('settings.load_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return cache?.value ?? DEFAULT_SETTINGS;
  }

  const raw: Record<string, unknown> = {};
  for (const row of data ?? []) {
    raw[row.key] = row.value;
  }

  const parsed = settingsSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : { ...DEFAULT_SETTINGS, ...coerce(raw) };

  if (!parsed.success) {
    logger.warn('settings.partially_invalid', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Aproveita as chaves válidas quando alguma outra veio corrompida. */
function coerce(raw: Record<string, unknown>): Partial<AppSettings> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isSettingKey(key)) continue;
    if (settingsSchema.shape[key].safeParse(value).success) out[key] = value;
  }
  return out as Partial<AppSettings>;
}

export function isSettingKey(key: string): key is SettingKey {
  return key in settingsSchema.shape;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
  return (await getSettings())[key];
}

export async function updateSetting<K extends SettingKey>(
  key: K,
  value: AppSettings[K],
  updatedBy: string,
): Promise<void> {
  const validated = settingsSchema.shape[key].parse(value) as AppSettings[K];

  const { error } = await supabaseAdmin()
    .from('app_settings')
    .upsert(
      {
        key,
        value: validated,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

  if (error) throw new Error(`falha ao gravar configuração ${key}: ${error.message}`);

  invalidateSettingsCache();
  logger.info('settings.updated', { key, updated_by: updatedBy });
}

export function invalidateSettingsCache(): void {
  cache = null;
}
