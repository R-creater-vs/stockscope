'use client';

import { memo } from 'react';
import type { SectorStat } from '@/lib/screenAggregate';
import { pct } from '@/lib/format';

/** Green above 50, red below — the swing score's own neutral point. */
function scoreColor(score: number): { bg: string; fg: string } {
  const s = Math.max(20, Math.min(85, score));
  if (s >= 50) {
    const t = (s - 50) / 35; // 0..1 across neutral→strong
    return { bg: `rgba(34,197,94,${0.12 + t * 0.33})`, fg: 'var(--foreground)' };
  }
  const t = (50 - s) / 30;
  return { bg: `rgba(239,68,68,${0.12 + t * 0.33})`, fg: 'var(--foreground)' };
}

function SectorHeatmap({
  sectors,
  onSelect,
}: {
  sectors: SectorStat[];
  onSelect: (symbol: string) => void;
}) {
  if (!sectors || sectors.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Sector rotation</h2>
        <span className="text-xs text-[var(--muted)]">strongest first</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Average setup strength by sector. Money rotates into sectors before individual stocks — a
        strong sector in a weak market is where to look first.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sectors.map((s) => {
          const c = scoreColor(s.avgScore);
          return (
            <button
              key={s.sector}
              onClick={() => s.leader && onSelect(s.leader.symbol)}
              className="flex flex-col rounded-lg border border-[var(--border)] p-3 text-left transition hover:border-[var(--accent)]"
              style={{ background: c.bg }}
              title={s.leader ? `Open ${s.leader.name}, the strongest name` : undefined}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold" style={{ color: c.fg }}>
                  {s.sector}
                </span>
                <span className="tnum text-sm font-bold" style={{ color: c.fg }}>
                  {Math.round(s.avgScore)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                <span className="tnum" title="Average 1-month move">
                  {pct(s.avgMomentum, 1, true)}
                </span>
                <span title="Share of sector on a buy signal">{s.breadth}% buys</span>
                <span>{s.count}</span>
              </div>

              {s.leader && (
                <span className="mt-1.5 truncate text-[11px] text-[var(--muted)]">
                  ★ {s.leader.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(SectorHeatmap);
