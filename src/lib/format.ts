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

/**
 * Validação de CPF pelos dígitos verificadores.
 *
 * Feita aqui para o cliente receber o erro na hora, em vez de descobrir que o
 * número está errado só quando o gateway recusar a criação do PIX.
 */
export function isValidCPF(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  // Sequências repetidas (000..., 111...) passam no cálculo, mas não são CPFs.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

export function formatCPF(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}
