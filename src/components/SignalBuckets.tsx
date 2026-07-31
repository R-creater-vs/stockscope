'use client';

import type { SignalBucket } from '@/lib/backtest';
import { pct } from '@/lib/format';

/**
 * The score → forward-return chart. This is the honesty test made visible: if
 * the bars rise left-to-right, a higher score really did lead to a higher
 * return. If they don't, the score is not predictive — and the chart says so
 * plainly rather than hiding it.
 */
export default function SignalBuckets({
  buckets,
  horizon,
}: {
  buckets: SignalBucket[];
  horizon: number;
}) {
  const max = Math.max(0.01, ...buckets.map((b) => Math.abs(b.avgForwardReturnPct)));

  return (
    <div>
      <div className="space-y-2">
        {buckets.map((b) => {
          const up = b.avgForwardReturnPct >= 0;
          const width = (Math.abs(b.avgForwardReturnPct) / max) * 50;
          return (
            <div key={b.label} className="flex items-center gap-3 text-xs">
              <span className="w-28 shrink-0 text-[var(--muted)]">{b.label}</span>
              <div className="relative h-4 flex-1 rounded bg-[var(--surface-2)]">
                <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--border)]" />
                <div
                  className="absolute top-0 h-full rounded"
                  style={{
                    width: `${width}%`,
                    left: up ? '50%' : `${50 - width}%`,
                    background: up ? 'var(--bull)' : 'var(--bear)',
                  }}
                />
              </div>
              <span
                className="tnum w-16 shrink-0 text-right"
                style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}
              >
                {pct(b.avgForwardReturnPct, 2, true)}
              </span>
              <span className="tnum hidden w-14 shrink-0 text-right text-[var(--muted)] sm:inline">
                {b.n.toLocaleString('en-IN')}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Average {horizon}-day forward return by score bucket. If the engine works, the higher
        buckets (right) should out-return the lower ones.
      </p>
    </div>
  );
}
