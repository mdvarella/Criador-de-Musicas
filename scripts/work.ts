import { loadEnv } from './load-env';

loadEnv();

/**
 * Worker da fila para desenvolvimento local.
 *
 * Em produção quem aciona a fila é o cron da Vercel, chamando
 * `/api/jobs/run`. Localmente não existe cron, e chamar a rota à mão a cada
 * ciclo é fricção desnecessária — ainda mais no Windows, onde um 401 silencioso
 * parece "nada acontecendo".
 *
 * Este script chama a MESMA função `runJobs()` que a rota HTTP chama. Não há
 * caminho paralelo, nem regra de negócio duplicada: é o mesmo worker, apenas
 * acionado por um laço local em vez de por uma requisição.
 *
 * Uso:
 *   npm run jobs:work                  laço contínuo, a cada 5 segundos
 *   npm run jobs:work -- --once        uma única passada
 *   npm run jobs:work -- --interval=2  laço com outro intervalo
 */

const args = process.argv.slice(2);
const RUN_ONCE = args.includes('--once');

const intervalArg = args.find((arg) => arg.startsWith('--interval='));
const INTERVAL_SECONDS = Math.max(Number.parseInt(intervalArg?.split('=')[1] ?? '5', 10) || 5, 1);

let stopping = false;

async function main() {
  const { runJobs } = await import('../src/jobs/runner');

  if (RUN_ONCE) {
    await tick(runJobs);
    return;
  }

  console.log(`Worker local ativo. Verificando a fila a cada ${INTERVAL_SECONDS}s.`);
  console.log('Deixe este terminal aberto enquanto testa. Ctrl+C para parar.\n');

  while (!stopping) {
    await tick(runJobs);
    if (stopping) break;
    await sleep(INTERVAL_SECONDS * 1000);
  }

  console.log('\nWorker local encerrado.');
}

async function tick(runJobs: typeof import('../src/jobs/runner')['runJobs']) {
  try {
    const result = await runJobs({ limit: 3 });

    // Silêncio quando não há nada a fazer: o terminal fica legível durante o
    // teste, e só aparece linha quando algo de fato aconteceu.
    if (result.claimed === 0) return;

    const parts = [
      `${result.claimed} job(s)`,
      `${result.succeeded} ok`,
      result.failed > 0 ? `${result.failed} com falha` : null,
      `${result.durationMs}ms`,
    ].filter(Boolean);

    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${parts.join(' · ')}`);

    if (result.failed > 0) {
      console.log('  Detalhe da falha saiu no log estruturado acima (job.failed).');
    }
  } catch (error) {
    // Um erro de conexão não pode derrubar o worker: o próximo ciclo tenta de novo.
    console.error(
      `[${new Date().toLocaleTimeString('pt-BR')}] falha ao processar a fila:`,
      error instanceof Error ? error.message : error,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on('SIGINT', () => {
  stopping = true;
});

main().catch((error) => {
  console.error('Worker local falhou:', error);
  process.exit(1);
});
