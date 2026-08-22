import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canAccessFullSong,
  canTransition,
  customerLabel,
  isPaid,
  isTerminal,
  statusesThatCanBecome,
} from '@/services/order-status';
import { ORDER_STATUSES } from '@/types/domain';

describe('máquina de estados do pedido', () => {
  it('permite o caminho feliz completo', () => {
    const happyPath = [
      'STORY_RECEIVED',
      'STORY_PROCESSING',
      'STORY_PROCESSED',
      'PREVIEW_QUEUED',
      'PREVIEW_GENERATING',
      'PREVIEW_READY',
      'AWAITING_PAYMENT',
      'PAID',
      'FULL_SONG_QUEUED',
      'FULL_SONG_GENERATING',
      'FULL_SONG_READY',
      'DELIVERY_PENDING',
      'DELIVERED',
    ] as const;

    for (let i = 0; i < happyPath.length - 1; i += 1) {
      expect(canTransition(happyPath[i]!, happyPath[i + 1]!)).toBe(true);
    }
  });

  it('não deixa um pedido pago voltar para aguardando pagamento', () => {
    expect(canTransition('PAID', 'AWAITING_PAYMENT')).toBe(false);
    expect(canTransition('DELIVERED', 'AWAITING_PAYMENT')).toBe(false);
    expect(canTransition('FULL_SONG_READY', 'PREVIEW_READY')).toBe(false);
  });

  it('não deixa pular do formulário direto para a música completa', () => {
    expect(canTransition('STORY_RECEIVED', 'FULL_SONG_QUEUED')).toBe(false);
    expect(canTransition('PREVIEW_READY', 'FULL_SONG_READY')).toBe(false);
  });

  it('trata a reaplicação do mesmo status como válida (idempotência)', () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it('reconhece os estados que já contam como pagos', () => {
    expect(isPaid('PAID')).toBe(true);
    expect(isPaid('FULL_SONG_GENERATING')).toBe(true);
    expect(isPaid('DELIVERED')).toBe(true);
    expect(isPaid('AWAITING_PAYMENT')).toBe(false);
    expect(isPaid('PREVIEW_READY')).toBe(false);
    expect(isPaid('FAILED')).toBe(false);
  });

  it('libera a música completa apenas nos estados pós-produção', () => {
    expect(canAccessFullSong('FULL_SONG_READY')).toBe(true);
    expect(canAccessFullSong('DELIVERY_PENDING')).toBe(true);
    expect(canAccessFullSong('DELIVERED')).toBe(true);
    expect(canAccessFullSong('PAID')).toBe(false);
    expect(canAccessFullSong('PREVIEW_READY')).toBe(false);
    expect(canAccessFullSong('REFUNDED')).toBe(false);
  });

  it('marca cancelado e reembolsado como terminais', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('REFUNDED')).toBe(true);
    expect(isTerminal('DELIVERED')).toBe(false);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
  });

  it('lista corretamente a origem possível de uma transição', () => {
    const origins = statusesThatCanBecome('PAID');
    expect(origins).toContain('AWAITING_PAYMENT');
    expect(origins).toContain('PAYMENT_PROCESSING');
    expect(origins).not.toContain('DELIVERED');
  });

  it('não expõe termo técnico ao consumidor', () => {
    for (const status of ORDER_STATUSES) {
      const label = customerLabel(status).toLowerCase();
      for (const forbidden of ['ia', 'prompt', 'token', 'generation', 'job', 'provider', 'erro']) {
        expect(label.split(/\s+/)).not.toContain(forbidden);
      }
    }
  });
});
