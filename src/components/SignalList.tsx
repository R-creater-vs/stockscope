'use client';

import type { Signal } from '@/lib/swing';

const DIR_COLOR = {
  bullish: 'var(--bull)',
  bearish: 'var(--bear)',
  neutral: 'var(--muted)',
} as const;

export default function SignalList({ signals }: { signals: Signal[] }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Signal breakdown</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Each check scored from strongly bearish to strongly bullish, then weighted into the
          headline score.
        </p>
      </header>

      <ul className="divide-y divide-[var(--border)]">
        {signals.map((s) => (
          <li key={s.name} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {s.category}
                  </span>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: DIR_COLOR[s.direction] }}
                  >
                    {s.direction}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.detail}</p>
              </div>

              <div className="shrink-0 text-right">
                <ScoreBar score={s.score} />
                <p className="mt-1 text-[10px] text-[var(--muted)]">weight {s.weight}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Diverging bar centred on zero — length shows conviction, side shows direction. */
function ScoreBar({ score }: { score: number }) {
  const width = Math.abs(score) * 50;
  const color = score > 0.05 ? 'var(--bull)' : score < -0.05 ? 'var(--bear)' : 'var(--muted)';

  return (
    <div className="relative h-2 w-24 rounded-full bg-[var(--surface-2)]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--border)]" />
      <div
        className="absolute top-0 h-full rounded-full transition-all"
        style={{
          width: `${width}%`,
          background: color,
          left: score >= 0 ? '50%' : `${50 - width}%`,
        }}
      />
    </div>
  );
}
