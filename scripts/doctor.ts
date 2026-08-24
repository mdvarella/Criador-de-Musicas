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
  let settings: Awaited<ReturnType<typeof import('../src/services/settings-service')['getSettings']>> | undefined;
  try {
    const { getSettings } = await import('../src/services/settings-service');
    settings = await getSettings({ fresh: true });
    for (const key of [
      'active_llm_provider',
      'active_music_provider',
      'active_payment_provider',
      'payment_methods',
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

  console.log('\n=== Checkout ===');
  reportCheckout(settings);

  console.log('\n=== Webhook de pagamento ===');
  reportWebhook();

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

/**
 * Reproduz a condição que a página de checkout usa para decidir se cada bloco
 * de pagamento aparece.
 *
 * Sem isso, "o formulário do cartão não carrega" é indistinguível de "o bloco do
 * cartão nem foi renderizado" — e os dois têm causas completamente diferentes.
 */
function reportCheckout(settings: { payment_methods: string[] } | undefined) {
  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || '';

  if (!settings) {
    console.log('  ⚠  configuração não lida acima: impossível dizer o que a página mostra.');
    console.log(
      `  public key do gateway   ${publicKey ? 'definida' : '⚠  AUSENTE'}`,
    );
    return;
  }

  const methods = settings.payment_methods;

  console.log(`  métodos habilitados     ${methods.length ? methods.join(', ') : '(nenhum)'}`);
  console.log(
    `  public key do gateway   ${
      publicKey ? `${publicKey.slice(0, 12)}… (${publicKey.length} caracteres)` : '⚠  AUSENTE'
    }`,
  );

  const pixVisible = methods.includes('pix');
  const cardVisible = methods.includes('card') && publicKey !== '';

  console.log(`  bloco PIX na página     ${pixVisible ? '✓ aparece' : '✗ NÃO aparece'}`);
  console.log(`  bloco cartão na página  ${cardVisible ? '✓ aparece' : '✗ NÃO aparece'}`);

  if (!cardVisible) {
    const reason = !methods.includes('card')
      ? "'card' não está em payment_methods (ajuste em /admin/configuracoes)"
      : 'NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY está vazia no .env.local';
    console.log(`     motivo: ${reason}`);
  }
}

/**
 * Confere o endereço que o gateway vai receber como `notification_url`.
 *
 * É o erro mais comum ao ligar o pagamento: `NEXT_PUBLIC_APP_URL` fica em
 * localhost, o gateway não consegue alcançar a rota, e o pagamento aprovado
 * nunca vira música — sem nenhum erro visível, porque a falha acontece do lado
 * de lá.
 */
function reportWebhook() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

  if (!appUrl) {
    console.log('  ⚠  NEXT_PUBLIC_APP_URL vazia: o gateway não saberá para onde notificar.');
    return;
  }

  const webhookUrl = `${appUrl}/api/webhooks/mercadopago`;
  console.log(`  notification_url        ${webhookUrl}`);

  let host = '';
  try {
    host = new URL(appUrl).hostname;
  } catch {
    console.log('  ⚠  NEXT_PUBLIC_APP_URL não é uma URL válida.');
    return;
  }

  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host === '[::1]';

  if (isLocal) {
    console.log(
      '  ⚠  Endereço LOCAL: o gateway não alcança esta máquina pela internet.\n' +
        '     Suba um túnel público e aponte NEXT_PUBLIC_APP_URL para a URL dele.',
    );
  } else if (!appUrl.startsWith('https://')) {
    console.log('  ⚠  O gateway exige HTTPS para entregar notificações.');
  } else {
    console.log('  ✓  Alcançável pela internet.');
  }

  console.log(
    `  segredo do webhook      ${
      process.env.MERCADO_PAGO_WEBHOOK_SECRET
        ? 'definido'
        : '⚠  AUSENTE — toda notificação será recusada com 401'
    }`,
  );
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
