export function formatDateTimeBR(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Normaliza o WhatsApp para E.164 brasileiro (somente dígitos, com DDI 55). */
export function normalizePhoneBR(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

export function maskPhoneBR(input: string): string {
  const digits = normalizePhoneBR(input);
  if (digits.length < 12) return input;
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  const head = rest.slice(0, rest.length - 4);
  return `(${ddd}) ${head}-${rest.slice(-4)}`;
}
