import type { Verdict } from '@/lib/swing';

/** A descriptive translation of existing score buckets; the model stays unchanged. */
const STYLE: Record<Verdict, { label: string; color: string; marker: string }> = {
  STRONG_BUY: { label: 'Strong bullish', color: 'var(--bull)', marker: '+' },
  BUY: { label: 'Bullish', color: 'var(--bull)', marker: '+' },
  HOLD: { label: 'Mixed', color: 'var(--muted)', marker: '±' },
  AVOID: { label: 'Bearish', color: 'var(--bear)', marker: '−' },
};

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: Verdict; size?: 'sm' | 'xs' }) {
  const style = STYLE[verdict];
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md text-xs font-medium ${size === 'xs' ? 'px-2 py-1' : 'px-2.5 py-1'}`} style={{ color: style.color, background: `color-mix(in srgb, ${style.color} 10%, transparent)` }} title="Direction of the technical rules, not a recommendation">
    <span aria-hidden="true">{style.marker}</span>{style.label}
  </span>;
}
