/**
 * Erros da aplicação.
 *
 * Regra do produto (item 32 da especificação): o consumidor nunca vê detalhe
 * técnico. Todo erro carrega uma `userMessage` acolhedora e o detalhe técnico
 * fica só no log e no painel administrativo.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'PROVIDER_ERROR'
  | 'PAYMENT_ERROR'
  | 'MAINTENANCE'
  | 'INTERNAL_ERROR';

const DEFAULT_USER_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION_ERROR: 'Alguns dados precisam de um ajuste antes de continuarmos.',
  NOT_FOUND: 'Não encontramos essa música. Confira se o link está completo.',
  RATE_LIMITED: 'Recebemos muitos pedidos seguidos. Aguarde um instante e tente novamente.',
  UNAUTHORIZED: 'Você precisa entrar para acessar esta área.',
  FORBIDDEN: 'Você não tem acesso a esta área.',
  CONFLICT: 'Este pedido já está sendo processado.',
  PROVIDER_ERROR:
    'Tivemos um problema enquanto criávamos sua música. Seu pedido está seguro e vamos tentar novamente automaticamente.',
  PAYMENT_ERROR: 'Não conseguimos iniciar o pagamento agora. Tente novamente em instantes.',
  MAINTENANCE: 'Estamos em manutenção rápida. Volte em alguns minutos.',
  INTERNAL_ERROR:
    'Algo saiu do esperado por aqui. Seu pedido está seguro e nossa equipe já foi avisada.',
};

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  PROVIDER_ERROR: 502,
  PAYMENT_ERROR: 502,
  MAINTENANCE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly status: number;
  readonly details?: unknown;
  /** Falhas transitórias podem ser reprocessadas pela fila. */
  readonly retryable: boolean;

  constructor(
    code: AppErrorCode,
    technicalMessage: string,
    options: { userMessage?: string; details?: unknown; retryable?: boolean } = {},
  ) {
    super(technicalMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGES[code];
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryable = options.retryable ?? code === 'PROVIDER_ERROR';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Mensagem segura para exibir ao consumidor, seja qual for o erro. */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.userMessage;
  return DEFAULT_USER_MESSAGES.INTERNAL_ERROR;
}

/** Detalhe técnico para log/painel — nunca para o consumidor. */
export function toTechnicalMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
