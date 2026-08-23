import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './load-env';

loadEnv();

/**
 * Diagnóstico do ambiente local.
 *
 * Responde, em um comando, à pergunta que mais custou tempo neste projeto:
 * "qual provider vai ser usado de verdade, e por quê?"
 *
 * Nunca imprime o valor de um segredo — apenas se está definido e o tamanho.
 */

const SECRET_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'MEDIA_SIGNING_SECRET',
  'JOBS_WORKER_SECRET',
  'RESEND_API_KEY',
];

const PLAIN_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_STORAGE_BUCKET',
  'OPENAI_MODEL',
  'ELEVENLABS_MUSIC_MODEL',
  'USE_MOCK_PROVIDERS',
  'ADMIN_ALLOWED_EMAILS',
];

async function main() {
  console.log('\n=== Arquivos de ambiente ===');
  reportEnvFiles();

  console.log('\n=== Variáveis ===');
  for (const key of PLAIN_KEYS) {
    console.log(`  ${key.padEnd(30)} ${process.env[key] || '(vazio)'}`);
  }
  for (const key of SECRET_KEYS) {
    const value = process.env[key] ?? '';
    console.log(
      `  ${key.padEnd(30)} ${value ? `definida (${value.length} caracteres)` : '⚠  AUSENTE'}`,
    );
  }

  console.log('\n=== Configuração no banco (app_settings) ===');
  let settings;
  try {
    const { getSettings } = await import('../src/services/settings-service');
    settings = await getSettings({ fresh: true });
    for (const key of [
      'active_llm_provider',
      'active_music_provider',
      'active_payment_provider',
      'preview_enabled',
      'preview_duration_seconds',
      'max_generation_attempts',
      'product_price_cents',
      'maintenance_mode',
    ] as const) {
      console.log(`  ${key.padEnd(30)} ${JSON.stringify(settings[key])}`);
    }
  } catch (error) {
    console.log('  ⚠  não foi possível ler:', error instanceof Error ? error.message : error);
  }

  console.log('\n=== Providers que serão usados ===');
  if (process.env.USE_MOCK_PROVIDERS === 'true') {
    console.log('  ⚠  USE_MOCK_PROVIDERS=true ignora o banco: TUDO roda em mock.');
  }
  await report('llm', () => import('../src/providers/llm').then((m) => m.getLLMProvider()));
  await report('music', () => import('../src/providers/music').then((m) => m.getMusicProvider()));
  await report('payment', () =>
    import('../src/providers/payment').then((m) => m.getPaymentProvider()),
  );

  console.log('');
}

async function report(kind: string, resolve: () => Promise<{ name: string; model?: string }>) {
  try {
    const provider = await resolve();
    const model = 'model' in provider && provider.model ? ` · ${provider.model}` : '';
    console.log(`  ${kind.padEnd(10)} ${provider.name}${model}`);
  } catch (error) {
    console.log(`  ${kind.padEnd(10)} ⚠  ${error instanceof Error ? error.message : error}`);
  }
}

/** Aponta chaves repetidas, que são a causa clássica de "configurei e não pegou". */
function reportEnvFiles() {
  let found = false;

  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    found = true;

    const seen = new Map<string, number[]>();
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');

    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;
      const separator = line.indexOf('=');
      if (separator === -1) return;
      const key = line.slice(0, separator).trim();
      seen.set(key, [...(seen.get(key) ?? []), index + 1]);
    });

    const duplicates = [...seen.entries()].filter(([, occurrences]) => occurrences.length > 1);

    console.log(`  ${file}: ${lines.length} linhas, ${seen.size} chaves`);

    for (const [key, occurrences] of duplicates) {
      console.log(
        `    ⚠  ${key} aparece nas linhas ${occurrences.join(', ')} — vale a linha ${occurrences.at(-1)}`,
      );
    }
  }

  if (!found) console.log('  ⚠  nenhum .env.local encontrado nesta pasta');
}

main().catch((error) => {
  console.error('Diagnóstico falhou:', error);
  process.exit(1);
});
