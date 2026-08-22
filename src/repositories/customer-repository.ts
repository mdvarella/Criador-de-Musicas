import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { CustomerRow } from '@/types/database';
import { unwrap, unwrapMaybe } from './errors';

export type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  acceptedTermsAt: string;
  acceptedPrivacyAt: string;
  marketingOptIn: boolean;
};

/**
 * O cliente não cria conta. Ele é identificado pelo e-mail, e um novo pedido do
 * mesmo e-mail reaproveita (e atualiza) o cadastro existente.
 */
export async function upsertCustomer(input: CustomerInput): Promise<CustomerRow> {
  const email = input.email.trim().toLowerCase();

  const existing = unwrapMaybe(
    await supabaseAdmin().from('customers').select('*').eq('email', email).maybeSingle(),
    'customers.findByEmail',
  );

  if (existing) {
    return unwrap(
      await supabaseAdmin()
        .from('customers')
        .update({
          name: input.name,
          phone: input.phone,
          accepted_terms_at: input.acceptedTermsAt,
          accepted_privacy_at: input.acceptedPrivacyAt,
          marketing_opt_in: input.marketingOptIn || existing.marketing_opt_in,
        })
        .eq('id', existing.id)
        .select('*')
        .single(),
      'customers.update',
    );
  }

  return unwrap(
    await supabaseAdmin()
      .from('customers')
      .insert({
        name: input.name,
        email,
        phone: input.phone,
        accepted_terms_at: input.acceptedTermsAt,
        accepted_privacy_at: input.acceptedPrivacyAt,
        marketing_opt_in: input.marketingOptIn,
      })
      .select('*')
      .single(),
    'customers.insert',
  );
}

export async function findCustomerById(id: string): Promise<CustomerRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('customers').select('*').eq('id', id).maybeSingle(),
    'customers.findById',
  );
}
