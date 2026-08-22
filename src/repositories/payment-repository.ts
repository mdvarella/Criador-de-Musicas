import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PaymentRow } from '@/types/database';
import type { PaymentStatus } from '@/types/domain';
import { unwrap, unwrapList, unwrapMaybe } from './errors';

export async function upsertPayment(input: {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  method: string | null;
  status: PaymentStatus;
  rawStatus: string;
  statusDetail: string | null;
  amountCents: number;
  currency: string;
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpiresAt?: string | null;
  approvedAt?: string | null;
}): Promise<PaymentRow> {
  return unwrap(
    await supabaseAdmin()
      .from('payments')
      .upsert(
        {
          order_id: input.orderId,
          provider: input.provider,
          provider_payment_id: input.providerPaymentId,
          method: input.method,
          status: input.status,
          raw_status: input.rawStatus,
          status_detail: input.statusDetail,
          amount_cents: input.amountCents,
          currency: input.currency,
          pix_qr_code: input.pixQrCode ?? null,
          pix_qr_code_base64: input.pixQrCodeBase64 ?? null,
          pix_expires_at: input.pixExpiresAt ?? null,
          approved_at: input.approvedAt ?? null,
        },
        { onConflict: 'provider,provider_payment_id' },
      )
      .select('*')
      .single(),
    'payments.upsert',
  );
}

export async function findPaymentByProviderId(
  provider: string,
  providerPaymentId: string,
): Promise<PaymentRow | null> {
  return unwrapMaybe(
    await supabaseAdmin()
      .from('payments')
      .select('*')
      .eq('provider', provider)
      .eq('provider_payment_id', providerPaymentId)
      .maybeSingle(),
    'payments.findByProviderId',
  );
}

export async function listPaymentsByOrder(orderId: string): Promise<PaymentRow[]> {
  return unwrapList(
    await supabaseAdmin()
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    'payments.listByOrder',
  );
}

export async function findLatestPendingPayment(orderId: string): Promise<PaymentRow | null> {
  const rows = unwrapList(
    await supabaseAdmin()
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .in('status', ['PENDING', 'IN_PROCESS'])
      .order('created_at', { ascending: false })
      .limit(1),
    'payments.findLatestPending',
  );
  return rows[0] ?? null;
}

export async function updatePayment(
  id: string,
  patch: Partial<PaymentRow>,
): Promise<PaymentRow> {
  return unwrap(
    await supabaseAdmin().from('payments').update(patch).eq('id', id).select('*').single(),
    'payments.update',
  );
}
