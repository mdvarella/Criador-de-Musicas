/**
 * Log estruturado (item 31 da especificação).
 *
 * Toda operação relevante carrega os identificadores de correlação
 * (request_id, order_id, generation_id, payment_id, job_id) e nenhum segredo:
 * os valores passam por `redact` antes de virarem JSON.
 */

export type LogContext = {
  request_id?: string;
  order_id?: string;
  generation_id?: string;
  payment_id?: string;
  job_id?: string;
  [key: string]: unknown;
};

type Level = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|access[_-]?token|service[_-]?role|signature|cvv|card)/i;

/** Tokens públicos de pedido são identificadores, não segredos de acesso total. */
const ALLOWED_TOKEN_KEYS = new Set(['public_token', 'delivery_token', 'idempotency_token']);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key) && !ALLOWED_TOKEN_KEYS.has(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redact(raw, depth + 1);
    }
    return out;
  }

  return String(value);
}

function emit(level: Level, message: string, context: LogContext = {}): void {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg: message,
    ...(redact(context) as Record<string, unknown>),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
  /** Cria um logger com contexto fixo — usado por job, request e webhook. */
  child(base: LogContext) {
    return {
      debug: (m: string, c?: LogContext) => emit('debug', m, { ...base, ...c }),
      info: (m: string, c?: LogContext) => emit('info', m, { ...base, ...c }),
      warn: (m: string, c?: LogContext) => emit('warn', m, { ...base, ...c }),
      error: (m: string, c?: LogContext) => emit('error', m, { ...base, ...c }),
    };
  },
};

export type Logger = ReturnType<typeof logger.child>;
