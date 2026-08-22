import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Cliente ligado à sessão do usuário (cookies). Usado exclusivamente para
 * descobrir QUEM é o administrador autenticado no /admin. A leitura de dados
 * operacionais continua sendo feita pela service role, depois da autorização.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem escrever cookies; o middleware cuida disso.
        }
      },
    },
  });
}
