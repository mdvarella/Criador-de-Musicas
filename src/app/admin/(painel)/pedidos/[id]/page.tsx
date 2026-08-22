import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderActions } from '@/features/admin/components/order-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { isAppError } from '@/lib/errors';
import { formatDateTimeBR, formatDuration, maskPhoneBR } from '@/lib/format';
import { centsToBRL, formatUSD } from '@/lib/money';
import { labelFor } from '@/schemas/catalog';
import { requireAdmin } from '@/services/admin-service';
import { getOrderDetail } from '@/services/order-admin-service';

export const dynamic = 'force-dynamic';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  let detail;
  try {
    detail = await getOrderDetail(id);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { order, customer, songRequest, generations, payments, events, notifications, jobs, attribution } =
    detail;

  const preview = generations.find((g) => g.type === 'PREVIEW');
  const full = generations.find((g) => g.type === 'FULL');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/pedidos" className="text-sm text-ink-soft hover:underline">
            ← Voltar para pedidos
          </Link>
          <h1 className="mt-1 text-2xl">
            Música para {order.recipient_name}
            {order.admin_flagged ? <span title="Marcado para revisão"> 🚩</span> : null}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">{order.id}</p>
        </div>

        <StatusBadge status={order.status} />
      </div>

      <Card title="Ações">
        <OrderActions orderId={order.id} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Cliente">
          <Field label="Nome" value={customer?.name ?? '—'} />
          <Field label="E-mail" value={customer?.email ?? '—'} />
          <Field
            label="WhatsApp"
            value={customer?.phone ? maskPhoneBR(customer.phone) : '—'}
          />
          <Field
            label="Consentimentos"
            value={
              customer?.accepted_terms_at
                ? `Aceitos em ${formatDateTimeBR(customer.accepted_terms_at)}`
                : 'Não registrados'
            }
          />
          <Field
            label="Marketing"
            value={customer?.marketing_opt_in ? 'Aceita receber' : 'Não aceita'}
          />
        </Card>

        <Card title="Configuração da música">
          <Field label="Destinatário" value={order.recipient_name} />
          <Field label="Relação" value={labelFor(order.relationship.split(':')[0])} />
          <Field label="Ocasião" value={labelFor(order.occasion.split(':')[0])} />
          <Field label="Estilo" value={labelFor(order.music_style)} />
          <Field label="Clima" value={labelFor(order.emotional_tone)} />
          <Field label="Voz" value={labelFor(order.voice_preference)} />
          <Field label="Plano" value={order.plan} />
          <Field label="Valor" value={centsToBRL(order.amount_cents)} />
          <Field
            label="Links"
            value={
              <span className="space-x-3">
                <Link href={`/musica/${order.public_token}`} className="underline" target="_blank">
                  Prévia
                </Link>
                {order.delivery_token ? (
                  <Link
                    href={`/sua-musica/${order.delivery_token}`}
                    className="underline"
                    target="_blank"
                  >
                    Entrega
                  </Link>
                ) : null}
              </span>
            }
          />
        </Card>
      </div>

      <Card title="História original">
        <pre className="max-h-96 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
          {songRequest?.original_story ?? '—'}
        </pre>

        {songRequest?.mandatory_phrase ? (
          <p className="mt-4 rounded-xl bg-wine-50 p-3 text-sm">
            <strong>Frase obrigatória:</strong> {songRequest.mandatory_phrase}
          </p>
        ) : null}

        {songRequest?.special_details &&
        Object.values(songRequest.special_details).some(Boolean) ? (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(songRequest.special_details)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-ink-soft">{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
        ) : null}
      </Card>

      <Card title="Criação (letra e direção)">
        <Field label="Resumo" value={songRequest?.story_summary ?? '—'} />
        <Field label="Direção musical" value={songRequest?.music_direction ?? '—'} />
        <Field label="Prompt musical" value={songRequest?.music_generation_prompt ?? '—'} />
        <Field
          label="Custo da criação de letra"
          value={
            songRequest?.llm_estimated_cost != null
              ? `${formatUSD(Number(songRequest.llm_estimated_cost))} · ${songRequest.llm_input_tokens ?? 0} entrada / ${songRequest.llm_output_tokens ?? 0} saída · ${songRequest.llm_model ?? ''}`
              : '—'
          }
        />

        {songRequest?.lyrics ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-wine-700">
              Ver letra completa
            </summary>
            <pre className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
              {songRequest.lyrics}
            </pre>
          </details>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Prévia">
          <GenerationBlock generation={preview} />
        </Card>

        <Card title="Música completa">
          <GenerationBlock generation={full} />
        </Card>
      </div>

      <Card title="Pagamentos">
        {payments.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum pagamento registrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink-soft">
              <tr>
                <th className="py-2">ID no gateway</th>
                <th>Método</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Criado</th>
                <th>Aprovado</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t border-cream-deep/60">
                  <td className="py-2 font-mono text-xs">{payment.provider_payment_id}</td>
                  <td>{payment.method ?? '—'}</td>
                  <td>
                    {payment.status}
                    {payment.status_detail ? (
                      <span className="block text-xs text-ink-soft">{payment.status_detail}</span>
                    ) : null}
                  </td>
                  <td>{centsToBRL(payment.amount_cents)}</td>
                  <td>{formatDateTimeBR(payment.created_at)}</td>
                  <td>{formatDateTimeBR(payment.approved_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Notificações">
          {notifications.length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhuma notificação enviada.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notifications.map((event) => (
                <li key={event.id} className="flex justify-between gap-3">
                  <span>
                    {event.event_type} · {event.channel}
                    {event.error_message ? (
                      <span className="block text-xs text-red-700">{event.error_message}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-soft">
                    {event.status} · {formatDateTimeBR(event.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Fila">
          {jobs.length === 0 ? (
            <p className="text-sm text-ink-soft">Nenhum trabalho registrado.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {jobs.map((job) => (
                <li key={job.id} className="flex justify-between gap-3">
                  <span>
                    {job.type}
                    {job.last_error ? (
                      <span className="block text-xs text-red-700">{job.last_error}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-soft">
                    {job.status} · {job.attempt_count}/{job.max_attempts}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {attribution ? (
        <Card title="Origem do cliente">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Field label="utm_source" value={attribution.utm_source ?? '—'} />
            <Field label="utm_medium" value={attribution.utm_medium ?? '—'} />
            <Field label="utm_campaign" value={attribution.utm_campaign ?? '—'} />
            <Field label="utm_content" value={attribution.utm_content ?? '—'} />
            <Field label="utm_term" value={attribution.utm_term ?? '—'} />
            <Field
              label="click ids"
              value={
                [attribution.fbclid && 'fbclid', attribution.ttclid && 'ttclid', attribution.gclid && 'gclid']
                  .filter(Boolean)
                  .join(', ') || '—'
              }
            />
          </dl>
        </Card>
      ) : null}

      <Card title="Linha do tempo">
        <ol className="space-y-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-cream-deep pl-4">
              <p className="font-medium">{event.event_type}</p>
              {event.message ? <p className="text-ink-soft">{event.message}</p> : null}
              <p className="text-xs text-ink-soft">
                {formatDateTimeBR(event.created_at)} · {event.actor}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function GenerationBlock({
  generation,
}: {
  generation:
    | (Awaited<ReturnType<typeof getOrderDetail>>['generations'][number] | undefined)
    | undefined;
}) {
  if (!generation) return <p className="text-sm text-ink-soft">Ainda não gerada.</p>;

  return (
    <div className="space-y-3 text-sm">
      <Field label="Status" value={generation.status} />
      <Field label="Provider" value={`${generation.provider} · ${generation.model ?? '—'}`} />
      <Field
        label="Tentativas"
        value={`${generation.attempt_count}/${generation.max_attempts}`}
      />
      <Field label="Duração" value={formatDuration(generation.duration_seconds)} />
      <Field
        label="Custo estimado"
        value={
          generation.estimated_cost != null ? formatUSD(Number(generation.estimated_cost)) : '—'
        }
      />
      <Field label="Iniciada" value={formatDateTimeBR(generation.started_at)} />
      <Field label="Concluída" value={formatDateTimeBR(generation.finished_at)} />

      {generation.error_message ? (
        <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{generation.error_message}</p>
      ) : null}

      {generation.audioUrl ? (
        <audio controls src={generation.audioUrl} className="w-full" preload="none" />
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs tracking-wide text-ink-soft uppercase">{label}</p>
      <div className="mt-0.5 text-sm break-words">{value}</div>
    </div>
  );
}
