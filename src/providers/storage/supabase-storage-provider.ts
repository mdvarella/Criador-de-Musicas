import 'server-only';
import { AppError } from '@/lib/errors';
import { serverEnv } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { StorageProvider, StoredFile } from './types';

/** StorageProvider sobre o Supabase Storage, em bucket privado. */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'supabase';
  private readonly bucket: string;

  constructor(bucket?: string) {
    this.bucket = bucket ?? serverEnv().SUPABASE_STORAGE_BUCKET;
  }

  async upload(path: string, data: Uint8Array, mimeType: string): Promise<StoredFile> {
    const { error } = await supabaseAdmin()
      .storage.from(this.bucket)
      .upload(path, data as unknown as ArrayBuffer, {
        contentType: mimeType,
        upsert: true,
        cacheControl: 'no-store',
      });

    if (error) {
      throw new AppError('PROVIDER_ERROR', `falha ao salvar áudio: ${error.message}`, {
        retryable: true,
      });
    }

    return { path, sizeBytes: data.byteLength, mimeType };
  }

  async download(path: string): Promise<{ data: Uint8Array; mimeType: string }> {
    const { data, error } = await supabaseAdmin().storage.from(this.bucket).download(path);

    if (error || !data) {
      throw new AppError('NOT_FOUND', `áudio não encontrado no storage: ${error?.message ?? path}`);
    }

    return {
      data: new Uint8Array(await data.arrayBuffer()),
      mimeType: data.type || 'audio/mpeg',
    };
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await supabaseAdmin()
      .storage.from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new AppError('PROVIDER_ERROR', `falha ao assinar URL: ${error?.message ?? path}`);
    }

    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    await supabaseAdmin().storage.from(this.bucket).remove([path]);
  }
}
