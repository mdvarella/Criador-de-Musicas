export type StoredFile = {
  /** Caminho interno no bucket. Nunca é uma URL pública. */
  path: string;
  sizeBytes: number;
  mimeType: string;
};

/**
 * Contrato de armazenamento de áudio.
 *
 * A regra é: o arquivo nasce privado. Quem decide se alguém pode ouvir é a
 * camada de serviço, nunca o bucket.
 */
export interface StorageProvider {
  readonly name: string;
  upload(path: string, data: Uint8Array, mimeType: string): Promise<StoredFile>;
  download(path: string): Promise<{ data: Uint8Array; mimeType: string }>;
  /** URL assinada e temporária, para uso interno/administrativo. */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}
