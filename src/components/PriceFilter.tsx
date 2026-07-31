'use client';

import { memo, useState } from 'react';

export interface PriceRange {
  label: string;
  min: number;
  max: number;
}

export const ANY_PRICE: PriceRange = { label: 'Any price', min: 0, max: Infinity };

const PRESETS: PriceRange[] = [
  ANY_PRICE,
  { label: 'Under ₹100', min: 0, max: 100 },
  { label: '₹100–250', min: 100, max: 250 },
  { label: '₹100–500', min: 100, max: 500 },
  { label: '₹500–1,500', min: 500, max: 1500 },
  { label: '₹1,500–5,000', min: 1500, max: 5000 },
  { label: 'Over ₹5,000', min: 5000, max: Infinity },
];

/**
 * Price filter for the suggestions. Selecting a band re-buckets the list in the
 * browser instantly — the filtering never touches the server. A custom min/max
 * covers anything the presets don't.
 */
function PriceFilter({
  value,
  onChange,
}: {
  value: PriceRange;
  onChange: (r: PriceRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const isCustom = value.label === 'Custom';

  const applyCustom = () => {
    const lo = min === '' ? 0 : Math.max(0, Number(min));
    const hi = max === '' ? Infinity : Number(max);
    if (isNaN(lo) || isNaN(hi) || hi < lo) return;
    onChange({ label: 'Custom', min: lo, max: hi });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--muted)]">Price:</span>
      {PRESETS.map((p) => {
        const activePreset = !isCustom && value.min === p.min && value.max === p.max;
        return (
          <button
            key={p.label}
            onClick={() => {
              setCustomOpen(false);
              onChange(p);
            }}
            className={`rounded-md px-2.5 py-1 text-xs transition ${
              activePreset
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]'
            }`}
          >
            {p.label}
          </button>
        );
      })}

      <button
        onClick={() => setCustomOpen((v) => !v)}
        className={`rounded-md px-2.5 py-1 text-xs transition ${
          isCustom
            ? 'bg-[var(--accent)] text-white'
            : 'border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]'
        }`}
      >
        Custom{isCustom ? ` (₹${value.min}–${value.max === Infinity ? '∞' : value.max})` : ''}
      </button>

      {customOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={min}
            placeholder="min"
            onChange={(e) => setMin(e.target.value)}
            className="tnum w-20 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
          <span className="text-xs text-[var(--muted)]">–</span>
          <input
            type="number"
            value={max}
            placeholder="max"
            onChange={(e) => setMax(e.target.value)}
            className="tnum w-20 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={applyCustom}
            className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white transition hover:brightness-110"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(PriceFilter);
