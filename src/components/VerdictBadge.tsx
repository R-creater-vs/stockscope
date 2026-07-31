import type { Verdict } from '@/lib/swing';

/**
 * The one-word buy call, shown wherever a stock is listed so "can I buy this?"
 * is answered at a glance. It's the same verdict the full report uses — the
 * rule-based technical score bucketed into STRONG BUY / BUY / HOLD / AVOID.
 */
const STYLE: Record<Verdict, { label: string; color: string }> = {
  STRONG_BUY: { label: 'STRONG BUY', color: 'var(--bull)' },
  BUY: { label: 'BUY', color: 'var(--bull)' },
  HOLD: { label: 'HOLD', color: 'var(--warn)' },
  AVOID: { label: 'AVOID', color: 'var(--bear)' },
};

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: Verdict; size?: 'sm' | 'xs' }) {
  const s = STYLE[verdict];
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold uppercase tracking-wider ${pad}`}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 15%, transparent)` }}
    >
      {(verdict === 'BUY' || verdict === 'STRONG_BUY') && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      )}
      {s.label}
    </span>
  );
}
