import type { OrderStatus } from '@/types/domain';

/**
 * Máquina de estados do pedido (item 14 da especificação).
 *
 * Ter o grafo declarado aqui — e não espalhado em `if`s pelo código — é o que
 * permite testar as transições e impedir que um retry de job ou um webhook
 * repetido empurre um pedido para trás (de PAID de volta a AWAITING_PAYMENT,
 * por exemplo).
 */

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['STORY_RECEIVED', 'CANCELLED', 'FAILED'],
  STORY_RECEIVED: ['STORY_PROCESSING', 'CANCELLED', 'FAILED'],
  STORY_PROCESSING: ['STORY_PROCESSED', 'FAILED', 'CANCELLED'],
  // Sem prévia habilitada, o pedido vai direto para o checkout.
  STORY_PROCESSED: ['PREVIEW_QUEUED', 'AWAITING_PAYMENT', 'FAILED', 'CANCELLED'],
  PREVIEW_QUEUED: ['PREVIEW_GENERATING', 'FAILED', 'CANCELLED'],
  PREVIEW_GENERATING: ['PREVIEW_READY', 'FAILED', 'CANCELLED'],
  PREVIEW_READY: ['AWAITING_PAYMENT', 'PREVIEW_QUEUED', 'CANCELLED', 'FAILED'],
  AWAITING_PAYMENT: ['PAYMENT_PROCESSING', 'PAID', 'CANCELLED', 'FAILED'],
  PAYMENT_PROCESSING: ['PAID', 'AWAITING_PAYMENT', 'CANCELLED', 'FAILED'],
  PAID: ['FULL_SONG_QUEUED', 'REFUNDED', 'FAILED'],
  FULL_SONG_QUEUED: ['FULL_SONG_GENERATING', 'FAILED', 'REFUNDED'],
  FULL_SONG_GENERATING: ['FULL_SONG_READY', 'FAILED', 'REFUNDED'],
  FULL_SONG_READY: ['DELIVERY_PENDING', 'DELIVERED', 'REFUNDED', 'FAILED'],
  DELIVERY_PENDING: ['DELIVERED', 'FAILED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  // Um pedido que falhou pode voltar ao fluxo por ação administrativa.
  FAILED: [
    'STORY_PROCESSING',
    'PREVIEW_QUEUED',
    'FULL_SONG_QUEUED',
    'AWAITING_PAYMENT',
    'CANCELLED',
    'REFUNDED',
  ],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // idempotência: reaplicar o mesmo status é inofensivo
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}

/** Estados a partir dos quais uma transição para `to` é válida. */
export function statusesThatCanBecome(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => canTransition(from, to));
}

const PAID_STATUSES = new Set<OrderStatus>([
  'PAID',
  'FULL_SONG_QUEUED',
  'FULL_SONG_GENERATING',
  'FULL_SONG_READY',
  'DELIVERY_PENDING',
  'DELIVERED',
]);

export function isPaid(status: OrderStatus): boolean {
  return PAID_STATUSES.has(status);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Estados em que a música completa pode ser ouvida e baixada. */
export function canAccessFullSong(status: OrderStatus): boolean {
  return status === 'FULL_SONG_READY' || status === 'DELIVERY_PENDING' || status === 'DELIVERED';
}

/**
 * Rótulos exibidos ao consumidor.
 *
 * Nenhum deles menciona IA, provider, geração ou erro técnico — o cliente
 * comprou uma emoção, não uma pipeline.
 */
const CUSTOMER_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Começando',
  STORY_RECEIVED: 'História recebida',
  STORY_PROCESSING: 'Lendo sua história',
  STORY_PROCESSED: 'História compreendida',
  PREVIEW_QUEUED: 'Preparando sua prévia',
  PREVIEW_GENERATING: 'Compondo sua prévia',
  PREVIEW_READY: 'Prévia pronta',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  PAYMENT_PROCESSING: 'Confirmando pagamento',
  PAID: 'Pagamento confirmado',
  FULL_SONG_QUEUED: 'Sua música entrou no estúdio',
  FULL_SONG_GENERATING: 'Gravando sua música',
  FULL_SONG_READY: 'Sua música está pronta',
  DELIVERY_PENDING: 'Preparando a entrega',
  DELIVERED: 'Entregue',
  FAILED: 'Tentando novamente',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

export function customerLabel(status: OrderStatus): string {
  return CUSTOMER_LABELS[status];
}

/** Agrupamento usado nas cores e filtros do painel. */
export function statusTone(status: OrderStatus): 'neutral' | 'progress' | 'success' | 'danger' {
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  if (status === 'DELIVERED' || status === 'FULL_SONG_READY') return 'success';
  if (status === 'DRAFT' || status === 'STORY_RECEIVED') return 'neutral';
  return 'progress';
}
