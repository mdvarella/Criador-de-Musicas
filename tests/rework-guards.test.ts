import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canTransition, isPaid, statusesThatCanBecome } from '@/services/order-status';
import type { OrderStatus } from '@/types/domain';

/**
 * Retrabalho antes do pagamento e proteção contra gasto indevido.
 *
 * Origem concreta: um job de reprocessamento rodou sobre um pedido em
 * AWAITING_PAYMENT, teve a transição recusada e MESMO ASSIM chamou o modelo de
 * texto. O painel, em paralelo, respondeu "história enviada para
 * reprocessamento" — sem que nada tivesse sido reprocessado.
 */

const providerCalls = { llm: 0, music: 0 };
let order: { id: string; status: OrderStatus; paid_at: string | null; [k: string]: unknown };
let events: string[];
let jobs: Array<{ type: string; dedupe_key: string | null }>;
let generations: Array<{ type: 'PREVIEW' | 'FULL'; status: string }>;

vi.mock('@/services/settings-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings-service')>(
    '@/services/settings-service',
  );
  return { ...actual, getSettings: async () => actual.DEFAULT_SETTINGS };
});

vi.mock('@/services/analytics-service', () => ({ trackServerEvent: async () => {} }));

vi.mock('@/repositories/event-repository', () => ({
  recordOrderEvent: async (input: { eventType: string }) => {
    events.push(input.eventType);
  },
}));

vi.mock('@/repositories/order-repository', () => ({
  findOrderById: async () => order,
  updateOrder: async (_id: string, patch: Record<string, unknown>) => {
    Object.assign(order, patch);
    return order;
  },
  updateOrderStatusIfIn: async (
    _id: string,
    expected: OrderStatus[],
    patch: { status: OrderStatus },
  ) => {
    if (!expected.includes(order.status)) return null;
    Object.assign(order, patch);
    return { ...order };
  },
}));

vi.mock('@/repositories/song-request-repository', () => ({
  findSongRequestByOrderId: async () => ({
    order_id: 'order-1',
    original_story: 'Uma história de verdade, com detalhes suficientes para virar música.',
    special_details: {},
    mandatory_phrase: null,
    structured_story: null,
    lyrics: null,
  }),
  updateSongRequest: async () => ({}),
}));

vi.mock('@/repositories/job-repository', () => ({
  enqueueJob: async (input: { type: string; dedupeKey?: string }) => {
    if (input.dedupeKey && jobs.some((job) => job.dedupe_key === input.dedupeKey)) return null;
    const job = { type: input.type, dedupe_key: input.dedupeKey ?? null };
    jobs.push(job);
    return job;
  },
}));

vi.mock('@/repositories/generation-repository', () => ({
  ALIVE_GENERATION_STATUSES: ['QUEUED', 'RUNNING', 'READY'],
  findAliveGeneration: async () => null,
  findReadyGeneration: async () => null,
  insertGeneration: async () => ({
    id: 'gen-1',
    order_id: 'order-1',
    type: 'PREVIEW',
    status: 'QUEUED',
    attempt_count: 0,
    max_attempts: 3,
  }),
  updateGeneration: async () => ({}),
  cancelAliveGenerations: async (_orderId: string, type: 'PREVIEW' | 'FULL') => {
    let count = 0;
    for (const generation of generations) {
      if (generation.type === type && ['QUEUED', 'RUNNING', 'READY'].includes(generation.status)) {
        generation.status = 'CANCELLED';
        count += 1;
      }
    }
    return count;
  },
  listGenerationsByOrder: async () => generations,
}));

vi.mock('@/providers/llm', () => ({
  getLLMProvider: async () => ({
    name: 'openai',
    model: 'gpt-teste',
    interpretStory: async () => {
      providerCalls.llm += 1;
      throw new Error('o modelo de texto não deveria ter sido chamado');
    },
  }),
}));

vi.mock('@/providers/music', () => ({
  getMusicProvider: async () => ({
    name: 'elevenlabs',
    model: 'music_v2',
    supportsAsyncStatus: false,
    generatePreview: async () => {
      providerCalls.music += 1;
      throw new Error('o motor musical não deveria ter sido chamado');
    },
    generateFullSong: async () => {
      providerCalls.music += 1;
      throw new Error('o motor musical não deveria ter sido chamado');
    },
  }),
}));

const { processStory } = await import('@/services/story-service');
const { generatePreview, generateFullSong } = await import('@/services/song-service');
const { adminRegeneratePreview, adminReprocessStory, adminResendDelivery } = await import(
  '@/services/order-admin-service'
);

beforeEach(() => {
  providerCalls.llm = 0;
  providerCalls.music = 0;
  events = [];
  jobs = [];
  generations = [];
  order = { id: 'order-1', status: 'AWAITING_PAYMENT', paid_at: null };
});

describe('serviços pagos não rodam com transição recusada', () => {
  it('não chama o modelo de texto quando o pedido já foi pago', async () => {
    order.status = 'DELIVERED';
    order.paid_at = '2026-08-23T12:00:00.000Z';

    await processStory('order-1');

    expect(providerCalls.llm).toBe(0);
    expect(events).toContain('operation_skipped');
  });

  it('não chama o motor musical para prévia quando o pedido já está pago', async () => {
    order.status = 'FULL_SONG_READY';
    order.paid_at = '2026-08-23T12:00:00.000Z';

    await generatePreview('order-1');

    expect(providerCalls.music).toBe(0);
    expect(events).toContain('operation_skipped');
  });

  it('não chama o motor musical para música completa em estado inválido', async () => {
    order.status = 'DELIVERED';
    order.paid_at = '2026-08-23T12:00:00.000Z';

    await generateFullSong('order-1');

    expect(providerCalls.music).toBe(0);
  });

  it('registra o motivo na linha do tempo em vez de falhar em silêncio', async () => {
    order.status = 'CANCELLED';

    await generatePreview('order-1');

    expect(events).toContain('operation_skipped');
  });
});

describe('ações administrativas não mentem', () => {
  it('recusa reprocessar um pedido cancelado, sem enfileirar nada', async () => {
    order.status = 'CANCELLED';

    const result = await adminReprocessStory('order-1', 'admin@exemplo.com.br');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('CANCELLED');
    expect(jobs).toHaveLength(0);
  });

  it('recusa regerar prévia de pedido já entregue', async () => {
    order.status = 'DELIVERED';
    order.paid_at = '2026-08-23T12:00:00.000Z';

    const result = await adminRegeneratePreview('order-1', 'admin@exemplo.com.br');

    expect(result.ok).toBe(false);
    expect(jobs).toHaveLength(0);
  });

  it('recusa reenviar entrega sem música pronta', async () => {
    order.status = 'PAID';
    order.paid_at = '2026-08-23T12:00:00.000Z';

    const result = await adminResendDelivery('order-1', 'admin@exemplo.com.br');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ainda não está pronta');
    expect(jobs).toHaveLength(0);
  });
});

describe('retrabalho antes do pagamento', () => {
  it('permite reprocessar a história com o pedido em AWAITING_PAYMENT', async () => {
    order.status = 'AWAITING_PAYMENT';

    const result = await adminReprocessStory('order-1', 'admin@exemplo.com.br');

    expect(result.ok).toBe(true);
    expect(order.status).toBe('STORY_PROCESSING');
    expect(jobs.map((job) => job.type)).toContain('PROCESS_STORY');
  });

  it('cancela a prévia antiga ao reprocessar: ela não corresponde mais à letra', async () => {
    order.status = 'AWAITING_PAYMENT';
    generations = [{ type: 'PREVIEW', status: 'READY' }];

    await adminReprocessStory('order-1', 'admin@exemplo.com.br');

    expect(generations[0]!.status).toBe('CANCELLED');
  });

  it('permite regerar a prévia com o pedido em AWAITING_PAYMENT', async () => {
    order.status = 'AWAITING_PAYMENT';

    const result = await adminRegeneratePreview('order-1', 'admin@exemplo.com.br');

    expect(result.ok).toBe(true);
    expect(order.status).toBe('PREVIEW_QUEUED');
  });

  it('clique duplo não cria dois jobs nem duas cobranças de API', async () => {
    order.status = 'AWAITING_PAYMENT';

    await adminRegeneratePreview('order-1', 'admin@exemplo.com.br');
    const second = await adminRegeneratePreview('order-1', 'admin@exemplo.com.br');

    expect(jobs.filter((job) => job.type === 'GENERATE_PREVIEW')).toHaveLength(1);
    expect(second.message).toContain('em andamento');
  });
});

describe('pagamento nunca é recusado pelo estado interno', () => {
  it('todo estado de trabalho pré-pagamento aceita virar PAID', () => {
    const working: OrderStatus[] = [
      'STORY_PROCESSING',
      'STORY_PROCESSED',
      'PREVIEW_QUEUED',
      'PREVIEW_GENERATING',
      'PREVIEW_READY',
      'AWAITING_PAYMENT',
      'PAYMENT_PROCESSING',
      'FAILED',
    ];

    for (const status of working) {
      expect(canTransition(status, 'PAID')).toBe(true);
    }
  });

  it('a lista de estados elegíveis exclui os que já contam como pagos', () => {
    const eligible = statusesThatCanBecome('PAID').filter((status) => !isPaid(status));

    expect(eligible).toContain('AWAITING_PAYMENT');
    expect(eligible).toContain('PREVIEW_GENERATING');
    expect(eligible).not.toContain('PAID');
    expect(eligible).not.toContain('DELIVERED');
    expect(eligible).not.toContain('FULL_SONG_READY');
  });

  it('retrabalho continua proibido depois do pagamento', () => {
    for (const status of ['PAID', 'FULL_SONG_READY', 'DELIVERED'] as OrderStatus[]) {
      expect(canTransition(status, 'STORY_PROCESSING')).toBe(false);
      expect(canTransition(status, 'PREVIEW_QUEUED')).toBe(false);
    }
  });
});
