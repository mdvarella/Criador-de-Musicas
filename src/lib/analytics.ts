'use client';

import type { FunnelEvent } from '@/services/analytics-service';

/**
 * Camada de analytics do cliente.
 *
 * O evento sempre vai para o nosso backend (first-party, à prova de bloqueador)
 * e, quando os pixels estiverem configurados, também para Meta, GA4 e TikTok.
 * A ausência de qualquer pixel não pode quebrar a página.
 */

const UTM_KEY = 'mm_attribution';
const ANON_KEY = 'mm_anonymous_id';

export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'ttclid',
  'gclid',
] as const;

export type Attribution = Partial<Record<(typeof UTM_PARAMS)[number], string>> & {
  landing_path?: string;
  referrer?: string;
};

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Captura os parâmetros de campanha na primeira visita e os mantém.
 * A primeira atribuição vence: é ela que trouxe o cliente.
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {};

  const storage = safeStorage();
  const existing = readAttribution();
  const params = new URLSearchParams(window.location.search);

  const incoming: Attribution = {};
  for (const key of UTM_PARAMS) {
    const value = params.get(key);
    if (value) incoming[key] = value.slice(0, 200);
  }

  if (Object.keys(incoming).length === 0) return existing;

  const merged: Attribution = {
    ...incoming,
    landing_path: window.location.pathname,
    referrer: document.referrer ? document.referrer.slice(0, 400) : undefined,
  };

  try {
    storage?.setItem(UTM_KEY, JSON.stringify(merged));
  } catch {
    // Navegador em modo restrito: seguimos sem persistir.
  }

  return merged;
}

export function readAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = safeStorage()?.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  const storage = safeStorage();

  try {
    const existing = storage?.getItem(ANON_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    storage?.setItem(ANON_KEY, id);
    return id;
  } catch {
    return '';
  }
}

type PixelWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  ttq?: { track: (name: string, props?: Record<string, unknown>) => void };
};

/** Mapeia nosso funil para os eventos padrão de cada plataforma. */
const PIXEL_EVENT_MAP: Partial<Record<FunnelEvent, string>> = {
  landing_view: 'ViewContent',
  create_song_clicked: 'Lead',
  story_submitted: 'AddToCart',
  checkout_started: 'InitiateCheckout',
  payment_approved: 'Purchase',
};

export function track(
  eventName: FunnelEvent,
  properties: Record<string, unknown> = {},
  orderToken?: string,
): void {
  if (typeof window === 'undefined') return;

  const payload = {
    event: eventName,
    properties,
    orderToken,
    anonymousId: getAnonymousId(),
    utm: readAttribution(),
  };

  try {
    const body = JSON.stringify(payload);
    // sendBeacon sobrevive à navegação — importante nos cliques de CTA.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // Analytics nunca pode quebrar a experiência.
  }

  const w = window as PixelWindow;
  const mapped = PIXEL_EVENT_MAP[eventName];

  try {
    if (mapped && w.fbq) w.fbq('track', mapped, properties);
    if (w.gtag) w.gtag('event', eventName, properties);
    if (mapped && w.ttq) w.ttq.track(mapped, properties);
  } catch {
    // idem
  }
}
