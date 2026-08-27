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
  STORY_PROCESSING: ['STORY_PROCESSED', 'PAID', 'FAILED', 'CANCELLED'],
  // Sem prévia habilitada, o pedido vai direto para o checkout.
  STORY_PROCESSED: ['PREVIEW_QUEUED', 'AWAITING_PAYMENT', 'PAID', 'FAILED', 'CANCELLED'],
  // Os estados de trabalho pré-pagamento aceitam PAID: o dinheiro pode chegar a
  // qualquer momento, inclusive no meio de um retrabalho, e a confirmação de
  // pagamento nunca pode ser recusada por causa do estado interno do pedido.
  PREVIEW_QUEUED: ['PREVIEW_GENERATING', 'PAID', 'FAILED', 'CANCELLED'],
  PREVIEW_GENERATING: ['PREVIEW_READY', 'PAID', 'FAILED', 'CANCELLED'],
  PREVIEW_READY: ['AWAITING_PAYMENT', 'PREVIEW_QUEUED', 'STORY_PROCESSING', 'PAID', 'CANCELLED', 'FAILED'],
  // Retrabalho antes do pagamento é atendimento normal: o cliente ouviu a
  // prévia, não gostou da letra e pediu outra. Enquanto não há dinheiro
  // envolvido, voltar para a interpretação da história é seguro.
  AWAITING_PAYMENT: [
    'PAYMENT_PROCESSING',
    'PAID',
    'STORY_PROCESSING',
    'PREVIEW_QUEUED',
    'CANCELLED',
    'FAILED',
  ],
  PAYMENT_PROCESSING: ['PAID', 'AWAITING_PAYMENT', 'CANCELLED', 'FAILED'],
  // Depois de PAID não existe retrabalho automático: a música completa já foi
  // paga, e refazer letra ou prévia sairia do fluxo comercial. Regravar a
  // música é possível, mas só por decisão humana — ver ADMIN_TRANSITIONS.
  PAID: ['FULL_SONG_QUEUED', 'REFUNDED', 'FAILED'],
  FULL_SONG_QUEUED: ['FULL_SONG_GENERATING', 'FAILED', 'REFUNDED'],
  FULL_SONG_GENERATING: ['FULL_SONG_READY', 'FAILED', 'REFUNDED'],
  FULL_SONG_READY: ['DELIVERY_PENDING', 'DELIVERED', 'REFUNDED', 'FAILED'],
  DELIVERY_PENDING: ['DELIVERED', 'FAILED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  // Um pedido que falhou pode voltar ao fluxo por ação administrativa.
  // FAILED aceita PAID pelo mesmo motivo: o cliente pode ter pago um PIX
  // gerado antes da falha, e o dinheiro precisa ser registrado de qualquer jeito.
  FAILED: [
    'STORY_PROCESSING',
    'PREVIEW_QUEUED',
    'FULL_SONG_QUEUED',
    'AWAITING_PAYMENT',
    'PAID',
    'CANCELLED',
    'REFUNDED',
  ],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Transições que existem apenas por ação humana no painel.
 *
 * O grafo acima descreve o fluxo automático, e é ele que job, webhook e
 * serviço de geração enxergam: nada consegue tirar sozinho um pedido de
 * DELIVERED. Mas atendimento precisa — o cliente pagou, ouviu a música e não
 * gostou. Regravar custa dinheiro de verdade em cada tentativa, então a
 * decisão é de uma pessoa, com confirmação, e não de um retry de fila.
 *
 * Só a música completa entra aqui. Refazer letra ou prévia depois do
 * pagamento continua proibido: o produto entregue é a música.
 */
const ADMIN_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  FULL_SONG_READY: ['FULL_SONG_QUEUED'],
  DELIVERY_PENDING: ['FULL_SONG_QUEUED'],
  DELIVERED: ['FULL_SONG_QUEUED'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true; // idempotência: reaplicar o mesmo status é inofensivo
  return TRANSITIONS[from].includes(to);
}

/** Como `canTransition`, mais o que o painel pode fazer por decisão humana. */
export function canTransitionAsAdmin(from: OrderStatus, to: OrderStatus): boolean {
  if (canTransition(from, to)) return true;
  return ADMIN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}

/** Estados a partir dos quais uma transição para `to` é válida. */
export function statusesThatCanBecome(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) => canTransition(from, to));
}

/** Idem, incluindo as transições exclusivas do painel. */
export function statusesThatCanBecomeAsAdmin(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) =>
    canTransitionAsAdmin(from, to),
  );
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
