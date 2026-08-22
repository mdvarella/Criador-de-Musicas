import 'server-only';
import { SupabaseStorageProvider } from './supabase-storage-provider';
import type { StorageProvider } from './types';

export type { StorageProvider, StoredFile } from './types';
export { SupabaseStorageProvider } from './supabase-storage-provider';

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!cached) cached = new SupabaseStorageProvider();
  return cached;
}
