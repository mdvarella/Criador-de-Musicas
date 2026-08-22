'use client';

import type { CatalogOption } from '@/schemas/catalog';

export function ChipGroup({
  options,
  value,
  onChange,
  name,
  columns = 2,
}: {
  options: CatalogOption[];
  value: string | null;
  onChange: (value: string) => void;
  name: string;
  columns?: 1 | 2;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={columns === 2 ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className="chip justify-center text-center"
        >
          {option.emoji ? <span aria-hidden>{option.emoji}</span> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
  hint,
  maxLength,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
  hint?: string;
  maxLength?: number;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  rows = 8,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  maxLength: number;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        className="field-input resize-y leading-relaxed"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 flex items-center justify-between text-xs text-ink-soft">
        <span>{hint}</span>
        <span aria-live="polite">
          {value.length}/{maxLength}
        </span>
      </span>
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = Math.round(((current + 1) / total) * 100);

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-soft">
        <span>
          Passo {current + 1} de {total}
        </span>
        <span>{percent}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-cream-deep"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-wine-500 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
