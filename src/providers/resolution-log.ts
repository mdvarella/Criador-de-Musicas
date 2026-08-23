import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Registra qual provider foi escolhido e por quê.
 *
 * Existe porque a escolha silenciosa já custou caro: com uma variável de
 * ambiente errada, o sistema caía em mock sem dizer nada, e o sintoma só
 * aparecia depois, no banco, como uma geração de custo zero.
 */
export type ResolutionReason =
  | 'USE_MOCK_PROVIDERS'
  | 'configuração active_*_provider'
  | 'provider configurado';

export function logProviderChoice(
  kind: 'llm' | 'music' | 'payment',
  provider: string,
  reason: ResolutionReason,
): void {
  logger.info('provider.resolved', { kind, provider, reason });
}
