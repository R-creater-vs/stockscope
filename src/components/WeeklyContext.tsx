'use client';

import type { HigherTimeframe } from '@/lib/swing';
import { inr } from '@/lib/format';

const TONE = {
  bullish: { color: 'var(--bull)', label: 'Weekly uptrend' },
  bearish: { color: 'var(--bear)', label: 'Weekly downtrend' },
  neutral: { color: 'var(--muted)', label: 'Weekly sideways' },
} as const;

/**
 * The higher-timeframe check, shown next to the daily verdict. Its job is to
 * answer one question a single-timeframe view can't: is the bigger trend with
 * this trade or against it?
 */
export default function WeeklyContext({ weekly }: { weekly: HigherTimeframe | null }) {
  if (!weekly) return null;
  const tone = TONE[weekly.trend];

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-5 py-3.5"
      style={{ borderColor: `${tone.color}44` }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.color }} />
        <span className="text-sm font-semibold" style={{ color: tone.color }}>
          {tone.label}
        </span>
      </div>
      <p className="flex-1 text-sm text-[var(--muted)]">{weekly.detail}</p>
      <div className="flex gap-4 text-xs text-[var(--muted)]">
        {weekly.ema10 !== null && (
          <span className="tnum">
            10w EMA {inr(weekly.ema10, 0)}
          </span>
        )}
        {weekly.rsi14 !== null && <span className="tnum">Wkly RSI {weekly.rsi14.toFixed(0)}</span>}
      </div>
    </div>
  );
}
