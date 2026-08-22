import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import type { OrderStatus } from '@/types/domain';

/**
 * Criação de geração e proteção contra geração duplicada (item 36).
 *
 * Duas regras são verificadas aqui:
 *   1. música completa exige pagamento confirmado;
 *   2. nunca existe mais de uma geração viva por pedido e tipo — inclusive
 *      quando dois workers correm ao mesmo tempo.
 */

const story = {
  recipient: { name: 'Marina', relationship: 'Namorada' },
  occasion: 'Aniversário',
  story_summary: 'Se conheceram numa festa e nunca mais se separaram, entre viagens e mudanças.',
  important_facts: ['festa junina'],
  mandatory_phrases: [],
  emotional_tone: 'Romântico',
  music_style: 'Romântica',
  voice_preference: 'Surpresa',
  song_structure: {
    intro: 'Violão',
    verse_1: 'Verso 1',
    chorus: 'Refrão',
    verse_2: 'Verso 2',
    bridge: 'Ponte',
    final_chorus: 'Refrão final',
  },
  lyrics: 'a'.repeat(200),
  music_generation_prompt: 'balada romântica com violão e cordas',
  music_direction: 'Andamento moderado, violão base.',
  preview_hook: 'Marina, é você que faz o meu tempo valer.',
};

type Gen = {
  id: string;
  order_id: string;
  type: 'PREVIEW' | 'FULL';
  status: string;
  attempt_count: number;
  max_attempts: number;
};

let order: { id: string; status: OrderStatus; paid_at: string | null; [key: string]: unknown };
let generations: Gen[];
let insertCalls: number;
let uploadCalls: number;

vi.mock('@/services/settings-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings-service')>(
    '@/services/settings-service',
  );
  return { ...actual, getSettings: async () => actual.DEFAULT_SETTINGS };
});

vi.mock('@/services/analytics-service', () => ({ trackServerEvent: async () => {} }));
vi.mock('@/repositories/event-repository', () => ({ recordOrderEvent: async () => {} }));
vi.mock('@/repositories/job-repository', () => ({ enqueueJob: async () => null }));

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
    structured_story: story,
    lyrics: story.lyrics,
  }),
}));

vi.mock('@/repositories/generation-repository', () => ({
  ALIVE_GENERATION_STATUSES: ['QUEUED', 'RUNNING', 'READY'],
  findAliveGeneration: async (orderId: string, type: 'PREVIEW' | 'FULL') =>
    generations.find(
      (g) => g.order_id === orderId && g.type === type && ['QUEUED', 'RUNNING', 'READY'].includes(g.status),
    ) ?? null,
  insertGeneration: async (input: { orderId: string; type: 'PREVIEW' | 'FULL' }) => {
    insertCalls += 1;
    // Reproduz o índice único parcial `generations_one_alive_per_type`.
    const alive = generations.find(
      (g) =>
        g.order_id === input.orderId &&
        g.type === input.type &&
        ['QUEUED', 'RUNNING', 'READY'].includes(g.status),
    );
    if (alive) throw new AppError('CONFLICT', 'generations.insert: violação de unicidade');

    const created: Gen = {
      id: `gen-${generations.length + 1}`,
      order_id: input.orderId,
      type: input.type,
      status: 'QUEUED',
      attempt_count: 0,
      max_attempts: 3,
    };
    generations.push(created);
    return created;
  },
  updateGeneration: async (id: string, patch: Record<string, unknown>) => {
    const found = generations.find((g) => g.id === id);
    if (found) Object.assign(found, patch);
    return found;
  },
  cancelAliveGenerations: async (orderId: string, type: 'PREVIEW' | 'FULL') => {
    let count = 0;
    for (const generation of generations) {
      if (
        generation.order_id === orderId &&
        generation.type === type &&
        ['QUEUED', 'RUNNING', 'READY'].includes(generation.status)
      ) {
        generation.status = 'CANCELLED';
        count += 1;
      }
    }
    return count;
  },
  findReadyGeneration: async () => null,
}));

vi.mock('@/providers/storage', () => ({
  getStorageProvider: () => ({
    upload: async (path: string, data: Uint8Array, mimeType: string) => {
      uploadCalls += 1;
      return { path, sizeBytes: data.byteLength, mimeType };
    },
  }),
}));

const { generateFullSong, generatePreview, buildSections } = await import(
  '@/services/song-service'
);

describe('geração da música completa', () => {
  beforeEach(() => {
    order = { id: 'order-1', status: 'FULL_SONG_QUEUED', paid_at: '2026-08-22T12:00:00.000Z' };
    generations = [];
    insertCalls = 0;
    uploadCalls = 0;
  });

  it('recusa gerar sem pagamento confirmado', async () => {
    order = { id: 'order-1', status: 'PREVIEW_READY', paid_at: null };

    await expect(generateFullSong('order-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(insertCalls).toBe(0);
    expect(uploadCalls).toBe(0);
  });

  it('recusa mesmo com status pago porém sem data de pagamento', async () => {
    order = { id: 'order-1', status: 'PAID', paid_at: null };
    await expect(generateFullSong('order-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('gera a música e emite o token de entrega', async () => {
    await generateFullSong('order-1');

    expect(uploadCalls).toBe(1);
    expect(generations.filter((g) => g.type === 'FULL' && g.status === 'READY')).toHaveLength(1);
    expect(order.delivery_token).toBeTruthy();
    expect(order.status).toBe('FULL_SONG_READY');
  });

  it('não gera de novo quando já existe uma música pronta', async () => {
    await generateFullSong('order-1');
    const tokenAfterFirst = order.delivery_token;

    order.status = 'FULL_SONG_QUEUED';
    await generateFullSong('order-1');

    expect(uploadCalls).toBe(1);
    expect(generations.filter((g) => g.type === 'FULL')).toHaveLength(1);
    expect(order.delivery_token).toBe(tokenAfterFirst);
  });

  it('perde a corrida em silêncio quando outro worker já criou a geração', async () => {
    // Duas execuções simultâneas do mesmo job.
    await Promise.all([generateFullSong('order-1'), generateFullSong('order-1')]);

    expect(generations.filter((g) => g.type === 'FULL')).toHaveLength(1);
    expect(uploadCalls).toBe(1);
  });

  it('o token de entrega é diferente do token público do pedido', async () => {
    await generateFullSong('order-1');
    expect(order.delivery_token).not.toBe(order.public_token);
    expect(String(order.delivery_token).length).toBeGreaterThanOrEqual(20);
  });
});

describe('geração da prévia', () => {
  beforeEach(() => {
    order = { id: 'order-1', status: 'PREVIEW_QUEUED', paid_at: null };
    generations = [];
    insertCalls = 0;
    uploadCalls = 0;
  });

  it('gera a prévia sem exigir pagamento', async () => {
    await generatePreview('order-1');

    expect(uploadCalls).toBe(1);
    expect(order.status).toBe('PREVIEW_READY');
    expect(generations.filter((g) => g.type === 'PREVIEW' && g.status === 'READY')).toHaveLength(1);
  });

  it('não gera prévia duplicada', async () => {
    await generatePreview('order-1');
    order.status = 'PREVIEW_QUEUED';
    await generatePreview('order-1');

    expect(uploadCalls).toBe(1);
  });
});

describe('montagem das seções da música', () => {
  it('respeita os limites de duração por seção do provider', () => {
    const sections = buildSections(
      { music_style: 'ROMANTICA' } as never,
      story as never,
      150,
    );

    expect(sections).toHaveLength(6);
    for (const section of sections) {
      expect(section.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(section.durationSeconds).toBeLessThanOrEqual(120);
    }

    const total = sections.reduce((sum, section) => sum + section.durationSeconds, 0);
    expect(total).toBeGreaterThan(120);
    expect(total).toBeLessThan(180);
  });

  it('nunca instrui imitação de artista', () => {
    const sections = buildSections({ music_style: 'POP' } as never, story as never, 150);
    for (const section of sections) {
      expect(section.negativeStyles.join(' ')).toContain('imitação de artista');
    }
  });
});
