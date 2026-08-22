import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, requireEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Cliente de servidor com service role.
 *
 * Ignora RLS por design: todas as tabelas negam acesso a anon/authenticated e
 * quem decide o que pode ser lido é a camada de serviço. Este módulo é
 * `server-only` — importá-lo de um Client Component quebra o build.
 */

let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = publicEnv.supabaseUrl;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente. Configure o Supabase antes de continuar.');
  }

  cached = createClient<Database>(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'minha-musica-ia/server' } },
  });

  return cached;
}

export function resetSupabaseAdminCache(): void {
  cached = null;
}
