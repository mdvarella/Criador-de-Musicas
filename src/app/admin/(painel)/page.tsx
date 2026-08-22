import Link from 'next/link';
import { centsToBRL, formatUSD } from '@/lib/money';
import { requireAdmin } from '@/services/admin-service';
import { getDashboardMetrics } from '@/services/metrics-service';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl">Visão geral de hoje</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Números do dia corrente (fuso de Brasília).
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Pedidos hoje" value={String(metrics.ordersCount)} />
        <Metric label="Vendas hoje" value={String(metrics.paidOrdersCount)} />
        <Metric label="Faturamento" value={centsToBRL(metrics.revenueCents)} highlight />
        <Metric
          label="Conversão prévia → pagamento"
          value={`${metrics.previewToPaymentRate}%`}
        />
        <Metric label="Prévias geradas" value={String(metrics.previewsGenerated)} />
        <Metric label="Pagamentos aprovados" value={String(metrics.paymentsApproved)} />
        <Metric label="Músicas completas" value={String(metrics.fullSongsReady)} />
        <Metric
          label="Pedidos com erro"
          value={String(metrics.failedOrders)}
          tone={metrics.failedOrders > 0 ? 'danger' : 'neutral'}
        />
      </section>

      <section className="card p-6">
        <h2 className="text-lg">Custos estimados do dia</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Custos de IA são estimativas calculadas a partir de tokens consumidos e duração de áudio
          gerada. A taxa do gateway usa o percentual configurado.
        </p>

        <dl className="mt-5 grid gap-4 sm:grid-cols-4">
          <CostRow label="Criação de letra" value={formatUSD(metrics.costs.llmUsd)} />
          <CostRow label="Criação de áudio" value={formatUSD(metrics.costs.musicUsd)} />
          <CostRow label="Taxa do gateway" value={centsToBRL(metrics.costs.gatewayBrl * 100)} />
          <CostRow
            label="Margem estimada (sem IA)"
            value={centsToBRL(metrics.estimatedMarginBrl * 100)}
          />
        </dl>

        <p className="mt-4 text-xs text-ink-soft">
          A margem acima desconta apenas a taxa do gateway. Os custos de IA aparecem em dólar
          porque ainda não há cotação de câmbio integrada — somá-los ao reais exigiria um número
          inventado, e isso ficaria fora daqui.
        </p>
      </section>

      <section className="card flex items-center justify-between p-6">
        <div>
          <h2 className="text-lg">Fila de processamento</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {metrics.pendingJobs === 0
              ? 'Nenhum trabalho pendente.'
              : `${metrics.pendingJobs} trabalho(s) aguardando ou em execução.`}
          </p>
        </div>
        <Link href="/admin/pedidos?status=FAILED" className="btn-ghost text-sm">
          Ver pedidos com erro
        </Link>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-soft">{label}</p>
      <p
        className={[
          'mt-2 font-display text-3xl',
          highlight ? 'text-wine-700' : '',
          tone === 'danger' ? 'text-wine-600' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
