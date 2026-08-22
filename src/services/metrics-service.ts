import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OrderStatus } from '@/types/domain';
import { getSettings } from './settings-service';

/**
 * Métricas do painel (itens 20 e 30 da especificação).
 *
 * Todas as contagens saem de queries com `head: true` — trazemos números, não
 * linhas. E o cálculo de margem é explicitamente uma ESTIMATIVA: custos de IA
 * são estimados a partir de tokens e duração, e a taxa do gateway vem da
 * configuração.
 */

export type DashboardMetrics = {
  rangeLabel: string;
  ordersCount: number;
  paidOrdersCount: number;
  revenueCents: number;
  previewsGenerated: number;
  paymentsApproved: number;
  fullSongsReady: number;
  failedOrders: number;
  /** Prévias que viraram pagamento, em %. */
  previewToPaymentRate: number;
  costs: {
    llmUsd: number;
    musicUsd: number;
    gatewayBrl: number;
  };
  estimatedMarginBrl: number;
  pendingJobs: number;
};

const FAILED_STATUSES: OrderStatus[] = ['FAILED'];

export function startOfTodayBR(): string {
  // O Brasil opera em UTC-3 o ano todo desde o fim do horário de verão.
  const now = new Date();
  const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const midnightBr = Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate());
  return new Date(midnightBr + 3 * 60 * 60 * 1000).toISOString();
}

export async function getDashboardMetrics(since?: string): Promise<DashboardMetrics> {
  const from = since ?? startOfTodayBR();
  const db = supabaseAdmin();
  const settings = await getSettings();

  const [
    ordersCount,
    paidOrders,
    previewsGenerated,
    paymentsApproved,
    fullSongsReady,
    failedOrders,
    pendingJobs,
    llmCosts,
    musicCosts,
  ] = await Promise.all([
    count(db.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', from)),
    db
      .from('orders')
      .select('amount_cents')
      .not('paid_at', 'is', null)
      .gte('paid_at', from),
    count(
      db
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'PREVIEW')
        .eq('status', 'READY')
        .gte('created_at', from),
    ),
    count(
      db
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'APPROVED')
        .gte('created_at', from),
    ),
    count(
      db
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'FULL')
        .eq('status', 'READY')
        .gte('created_at', from),
    ),
    count(
      db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', FAILED_STATUSES)
        .gte('created_at', from),
    ),
    count(
      db.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'RUNNING']),
    ),
    db.from('song_requests').select('llm_estimated_cost').gte('created_at', from),
    db.from('generations').select('actual_cost, estimated_cost').gte('created_at', from),
  ]);

  const paidRows = paidOrders.data ?? [];
  const revenueCents = paidRows.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);

  const llmUsd = (llmCosts.data ?? []).reduce(
    (sum, row) => sum + Number(row.llm_estimated_cost ?? 0),
    0,
  );
  const musicUsd = (musicCosts.data ?? []).reduce(
    (sum, row) => sum + Number(row.actual_cost ?? row.estimated_cost ?? 0),
    0,
  );

  const gatewayBrl = (revenueCents / 100) * (settings.payment_fee_percent / 100);

  // Custos de IA são cotados em dólar; a conversão precisa de uma taxa real
  // para a margem virar número confiável. Enquanto não houver cotação
  // integrada, exibimos os custos separados e a margem sem convertê-los.
  const estimatedMarginBrl = revenueCents / 100 - gatewayBrl;

  const previewToPaymentRate =
    previewsGenerated > 0 ? Number(((paymentsApproved / previewsGenerated) * 100).toFixed(1)) : 0;

  return {
    rangeLabel: from,
    ordersCount,
    paidOrdersCount: paidRows.length,
    revenueCents,
    previewsGenerated,
    paymentsApproved,
    fullSongsReady,
    failedOrders,
    previewToPaymentRate,
    costs: {
      llmUsd: Number(llmUsd.toFixed(4)),
      musicUsd: Number(musicUsd.toFixed(4)),
      gatewayBrl: Number(gatewayBrl.toFixed(2)),
    },
    estimatedMarginBrl: Number(estimatedMarginBrl.toFixed(2)),
    pendingJobs,
  };
}

async function count(query: PromiseLike<{ count: number | null }>): Promise<number> {
  const result = await query;
  return result.count ?? 0;
}
