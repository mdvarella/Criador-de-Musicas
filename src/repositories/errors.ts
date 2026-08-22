import type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
} from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';

/** Traduz o erro do Postgrest em AppError, preservando o detalhe só no log. */
export function fromPostgrest(error: PostgrestError, operation: string): AppError {
  // 23505 = unique_violation. É o que protege contra geração/cobrança duplicada.
  if (error.code === '23505') {
    return new AppError('CONFLICT', `${operation}: violação de unicidade (${error.details})`);
  }
  if (error.code === 'PGRST116') {
    return new AppError('NOT_FOUND', `${operation}: registro não encontrado`);
  }
  return new AppError('INTERNAL_ERROR', `${operation}: ${error.message}`);
}

export function unwrap<T>(result: PostgrestSingleResponse<T>, operation: string): T {
  if (result.error) throw fromPostgrest(result.error, operation);
  if (result.data === null) throw new AppError('NOT_FOUND', `${operation}: sem resultado`);
  return result.data;
}

export function unwrapList<T>(result: PostgrestResponse<T>, operation: string): T[] {
  if (result.error) throw fromPostgrest(result.error, operation);
  return result.data ?? [];
}

// Recebe PostgrestSingleResponse porque `maybeSingle()` já embute o `| null` no
// próprio T — declarar PostgrestMaybeSingleResponse<T> tornaria T inferível
// apenas como `never`.
export function unwrapMaybe<T>(result: PostgrestSingleResponse<T>, operation: string): T | null {
  if (result.error && result.error.code !== 'PGRST116') {
    throw fromPostgrest(result.error, operation);
  }
  return result.data;
}
