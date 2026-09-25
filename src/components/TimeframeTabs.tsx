'use client';

import type { Verdict } from '@/lib/swing';
import type { Timeframe, TimeframeAnalysis } from '@/lib/timeframes';
import type { Timeframes } from '@/lib/multiTimeframe';
import { VERDICT_LABEL } from './VerdictCard';

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
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Analysis timeframe">
      {ORDER.map((id) => {
        const tf: TimeframeAnalysis = timeframes[id];
        const selected = id === active;
        const color = VERDICT_COLOR[tf.verdict];
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={selected}
            aria-label={`${tf.label}, ${VERDICT_LABEL[tf.verdict]}, score ${tf.score} of 100`}
            className={`min-h-28 min-w-0 rounded-xl border p-2.5 text-left transition sm:p-4 ${
              selected
                ? 'border-[var(--accent)] bg-[var(--surface-2)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]'
            }`}
          >
            <p className="text-sm font-semibold">{tf.label}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{tf.horizon}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold" style={{ color }}>
                {tf.verdict === 'STRONG_BUY' ? 'Strong bullish' : tf.verdict === 'BUY' ? 'Bullish' : tf.verdict === 'HOLD' ? 'Mixed' : 'Bearish'}
              </span>
              <span className="tnum text-xs text-[var(--muted)]">{tf.score}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
