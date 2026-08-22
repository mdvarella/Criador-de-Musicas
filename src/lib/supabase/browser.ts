'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/** Cliente de browser. Usa apenas a anon key — nunca a service role. */
export function supabaseBrowser() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
