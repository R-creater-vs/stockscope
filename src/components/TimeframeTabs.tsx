'use client';

import type { Verdict } from '@/lib/swing';
import type { Timeframe, TimeframeAnalysis } from '@/lib/timeframes';
import type { Timeframes } from '@/lib/multiTimeframe';

const ORDER: Timeframe[] = ['short', 'mid', 'long'];

const VERDICT_COLOR: Record<Verdict, string> = {
  STRONG_BUY: 'var(--bull)',
  BUY: 'var(--bull)',
  HOLD: 'var(--warn)',
  AVOID: 'var(--bear)',
};

/**
 * The horizon switch. Each tab previews its own verdict and score, so the user
 * can see at a glance where the three timeframes agree or disagree — which is
 * itself a signal (all-three-aligned is a stronger case than one horizon alone).
 */
export default function TimeframeTabs({
  timeframes,
  active,
  onChange,
}: {
  timeframes: Timeframes;
  active: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ORDER.map((id) => {
        const tf: TimeframeAnalysis = timeframes[id];
        const selected = id === active;
        const color = VERDICT_COLOR[tf.verdict];
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={selected}
            className={`rounded-xl border p-3 text-left transition ${
              selected
                ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]'
            }`}
          >
            <p className="text-sm font-semibold">{tf.label}</p>
            <p className="text-[11px] text-[var(--muted)]">{tf.horizon}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold" style={{ color }}>
                {tf.verdictLabel}
              </span>
              <span className="tnum text-xs text-[var(--muted)]">{tf.score}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
