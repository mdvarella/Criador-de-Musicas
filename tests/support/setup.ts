import { beforeEach } from 'vitest';
import { resetServerEnvCache } from '@/lib/env';

/** Cada teste começa com um ambiente previsível. (O vitest já define NODE_ENV=test.) */
beforeEach(() => {
  process.env.MEDIA_SIGNING_SECRET = 'segredo-de-teste-suficientemente-longo';
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'webhook-secret-de-teste';
  process.env.MERCADO_PAGO_ACCESS_TOKEN = 'token-de-teste';
  process.env.ADMIN_ALLOWED_EMAILS = 'admin@exemplo.com.br, Chefe@Exemplo.com.br';
  process.env.JOBS_WORKER_SECRET = 'worker-secret-de-teste';
  // Testes nunca chamam serviço externo de verdade.
  process.env.USE_MOCK_PROVIDERS = 'true';
  resetServerEnvCache();
});
