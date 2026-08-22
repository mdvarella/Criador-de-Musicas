import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OrderRow } from '@/types/database';
import type { OrderStatus } from '@/types/domain';
import { unwrap, unwrapList, unwrapMaybe } from './errors';

export type CreateOrderRow = {
  customerId: string;
  publicToken: string;
  occasion: string;
  recipientName: string;
  relationship: string;
  musicStyle: string;
  voicePreference: string;
  emotionalTone: string;
  amountCents: number;
  plan: string;
  isSeed?: boolean;
};

export async function insertOrder(input: CreateOrderRow): Promise<OrderRow> {
  return unwrap(
    await supabaseAdmin()
      .from('orders')
      .insert({
        customer_id: input.customerId,
        public_token: input.publicToken,
        status: 'STORY_RECEIVED',
        plan: input.plan,
        occasion: input.occasion,
        recipient_name: input.recipientName,
        relationship: input.relationship,
        music_style: input.musicStyle,
        voice_preference: input.voicePreference,
        emotional_tone: input.emotionalTone,
        amount_cents: input.amountCents,
        currency: 'BRL',
        is_seed: input.isSeed ?? false,
      })
      .select('*')
      .single(),
    'orders.insert',
  );
}

export async function findOrderById(id: string): Promise<OrderRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('orders').select('*').eq('id', id).maybeSingle(),
    'orders.findById',
  );
}

export async function findOrderByPublicToken(token: string): Promise<OrderRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('orders').select('*').eq('public_token', token).maybeSingle(),
    'orders.findByPublicToken',
  );
}

export async function findOrderByDeliveryToken(token: string): Promise<OrderRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('orders').select('*').eq('delivery_token', token).maybeSingle(),
    'orders.findByDeliveryToken',
  );
}

export async function updateOrder(
  id: string,
  patch: Partial<OrderRow>,
): Promise<OrderRow> {
  return unwrap(
    await supabaseAdmin().from('orders').update(patch).eq('id', id).select('*').single(),
    'orders.update',
  );
}

/**
 * Atualização condicional de status.
 *
 * Só grava se o pedido ainda estiver em um dos estados esperados. É o que
 * impede que dois processos concorrentes (webhook duplicado, retry de job)
 * avancem o mesmo pedido duas vezes. Devolve null quando a transição não valeu.
 */
export async function updateOrderStatusIfIn(
  id: string,
  expected: OrderStatus[],
  patch: Partial<OrderRow> & { status: OrderStatus },
): Promise<OrderRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('orders')
    .update(patch)
    .eq('id', id)
    .in('status', expected)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`orders.updateStatusIfIn: ${error.message}`);
  return data;
}

export type OrderListFilters = {
  status?: OrderStatus[];
  paid?: boolean;
  hasError?: boolean;
  musicStyle?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type OrderListItem = OrderRow & {
  customers: { name: string; email: string; phone: string } | null;
};

export async function listOrders(
  filters: OrderListFilters,
): Promise<{ items: OrderListItem[]; total: number }> {
  const limit = Math.min(filters.limit ?? 25, 100);
  const offset = filters.offset ?? 0;

  let query = supabaseAdmin()
    .from('orders')
    .select('*, customers(name, email, phone)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.paid === true) query = query.not('paid_at', 'is', null);
  if (filters.paid === false) query = query.is('paid_at', null);
  if (filters.hasError) query = query.in('status', ['FAILED']);
  if (filters.musicStyle) query = query.eq('music_style', filters.musicStyle);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  if (filters.search) {
    const term = filters.search.trim();
    // Busca por id/token exatos ou por nome do destinatário.
    const escaped = term.replace(/[%,()]/g, '');
    query = query.or(
      `recipient_name.ilike.%${escaped}%,public_token.eq.${escaped},id.eq.${isUuid(term) ? term : '00000000-0000-0000-0000-000000000000'}`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`orders.list: ${error.message}`);

  return { items: (data ?? []) as OrderListItem[], total: count ?? 0 };
}

/** Busca por dados do cliente exige um passo a mais: filtramos os clientes primeiro. */
export async function findCustomerIdsByTerm(term: string): Promise<string[]> {
  const escaped = term.replace(/[%,()]/g, '');
  const rows = unwrapList(
    await supabaseAdmin()
      .from('customers')
      .select('id')
      .or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      .limit(200),
    'customers.searchByTerm',
  );
  return rows.map((r) => r.id);
}

export async function listOrdersByCustomerIds(
  customerIds: string[],
  limit = 25,
): Promise<OrderListItem[]> {
  if (customerIds.length === 0) return [];
  const rows = unwrapList(
    await supabaseAdmin()
      .from('orders')
      .select('*, customers(name, email, phone)')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false })
      .limit(limit),
    'orders.listByCustomerIds',
  );
  return rows as OrderListItem[];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
