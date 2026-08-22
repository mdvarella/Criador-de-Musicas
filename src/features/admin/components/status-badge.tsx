import { customerLabel, statusTone } from '@/services/order-status';
import type { OrderStatus } from '@/types/domain';

const TONE_CLASSES: Record<ReturnType<typeof statusTone>, string> = {
  neutral: 'bg-cream-deep text-ink-soft',
  progress: 'bg-wine-50 text-wine-700',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-700',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[statusTone(status)]}`}
      title={status}
    >
      {customerLabel(status)}
    </span>
  );
}
