import Link from 'next/link';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { formatDateTimeBR, maskPhoneBR } from '@/lib/format';
import { centsToBRL } from '@/lib/money';
import { MUSIC_STYLES, labelFor } from '@/schemas/catalog';
import { requireAdmin } from '@/services/admin-service';
import { searchOrders } from '@/services/order-admin-service';
import { ORDER_STATUSES, type OrderStatus } from '@/types/domain';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const status = single(params.status);
  const paid = single(params.paid);
  const style = single(params.style);
  const search = single(params.q);
  const from = single(params.from);
  const to = single(params.to);
  const page = Math.max(Number.parseInt(single(params.page) ?? '1', 10) || 1, 1);

  const { items, total } = await searchOrders({
    status: status && isOrderStatus(status) ? [status] : undefined,
    paid: paid === 'sim' ? true : paid === 'nao' ? false : undefined,
    musicStyle: style || undefined,
    search: search || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">Pedidos</h1>
        <p className="text-sm text-ink-soft">{total} pedido(s) encontrados</p>
      </div>

      {/* ------------------------------------------------------------ Filtros */}
      <form className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <label className="lg:col-span-2">
          <span className="field-label">Busca</span>
          <input
            name="q"
            defaultValue={search ?? ''}
            placeholder="Nome, e-mail, WhatsApp ou ID"
            className="field-input"
          />
        </label>

        <label>
          <span className="field-label">Status</span>
          <select name="status" defaultValue={status ?? ''} className="field-input">
            <option value="">Todos</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label">Pagamento</span>
          <select name="paid" defaultValue={paid ?? ''} className="field-input">
            <option value="">Todos</option>
            <option value="sim">Pagos</option>
            <option value="nao">Não pagos</option>
          </select>
        </label>

        <label>
          <span className="field-label">Estilo</span>
          <select name="style" defaultValue={style ?? ''} className="field-input">
            <option value="">Todos</option>
            {MUSIC_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="field-label">De</span>
            <input type="date" name="from" defaultValue={from ?? ''} className="field-input" />
          </label>
          <label>
            <span className="field-label">Até</span>
            <input type="date" name="to" defaultValue={to ?? ''} className="field-input" />
          </label>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="btn-primary">
            Filtrar
          </button>
          <Link href="/admin/pedidos" className="btn-ghost">
            Limpar
          </Link>
        </div>
      </form>

      {/* ------------------------------------------------------------- Tabela */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-cream-deep text-left text-ink-soft">
            <tr>
              <Th>ID</Th>
              <Th>Cliente</Th>
              <Th>Destinatário</Th>
              <Th>Ocasião</Th>
              <Th>Data</Th>
              <Th>Status</Th>
              <Th>Valor</Th>
              <Th>Pago</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-soft">
                  Nenhum pedido encontrado com esses filtros.
                </td>
              </tr>
            ) : null}

            {items.map((order) => (
              <tr key={order.id} className="border-b border-cream-deep/60 last:border-0">
                <Td>
                  <span className="font-mono text-xs">{order.id.slice(0, 8)}</span>
                  {order.admin_flagged ? <span title="Marcado para revisão"> 🚩</span> : null}
                </Td>
                <Td>
                  <div>{order.customers?.name ?? '—'}</div>
                  <div className="text-xs text-ink-soft">{order.customers?.email ?? ''}</div>
                  <div className="text-xs text-ink-soft">
                    {order.customers?.phone ? maskPhoneBR(order.customers.phone) : ''}
                  </div>
                </Td>
                <Td>{order.recipient_name}</Td>
                <Td>{labelFor(order.occasion.split(':')[0])}</Td>
                <Td>{formatDateTimeBR(order.created_at)}</Td>
                <Td>
                  <StatusBadge status={order.status} />
                </Td>
                <Td>{centsToBRL(order.amount_cents)}</Td>
                <Td>{order.paid_at ? '✓' : '—'}</Td>
                <Td>
                  <Link
                    href={`/admin/pedidos/${order.id}`}
                    className="font-medium text-wine-700 hover:underline"
                  >
                    Visualizar
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={buildPageHref(params, page - 1)}
              className="btn-ghost px-4 py-2"
            >
              Anterior
            </Link>
          ) : null}
          <span className="text-ink-soft">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildPageHref(params, page + 1)} className="btn-ghost px-4 py-2">
              Próxima
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

function buildPageHref(
  params: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v && key !== 'page') query.set(key, v);
  }
  query.set('page', String(page));
  return `/admin/pedidos?${query.toString()}`;
}
