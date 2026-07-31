'use client';

import { memo } from 'react';
import type { ScreenRow, SetupTag } from '@/lib/screenAggregate';
import { inr, pct } from '@/lib/format';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';
import { BacktestStat } from './BacktestStat';

const TAG_COLOR: Record<SetupTag, string> = {
  Breakout: '#22c55e',
  Momentum: '#3b82f6',
  Pullback: '#a855f7',
  Squeeze: '#eab308',
  Reversal: '#f97316',
};

function scoreColor(score: number): string {
  if (score >= 72) return 'var(--bull)';
  if (score >= 58) return '#4ade80';
  if (score >= 40) return 'var(--warn)';
  return 'var(--bear)';
}

/**
 * Memoised: a grid can hold dozens of these, and switching price band or tab
 * must not re-render cards whose data hasn't changed. Row objects keep their
 * identity across re-bucketing (they come from the same `all` array) and
 * `onClick` is a stable callback, so the default shallow compare is enough.
 */
function StockCard({ row, onClick }: { row: ScreenRow; onClick: (symbol: string) => void }) {
  const up = row.changePercent >= 0;

  return (
    <button
      onClick={() => onClick(row.symbol)}
      className="lift group flex w-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--accent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{row.name}</p>
            <StarButton symbol={row.symbol} name={row.name} size="sm" />
          </div>
          <p className="tnum mt-0.5 text-[11px] text-[var(--muted)]">
            {row.symbol.replace('.NS', '')} · {row.sector}
          </p>
        </div>

        <div
          className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg"
          style={{ background: `${scoreColor(row.score)}1a` }}
          title={`Technical score ${row.score}/100`}
        >
          <span className="tnum text-sm font-bold leading-none" style={{ color: scoreColor(row.score) }}>
            {Math.round(row.score)}
          </span>
          <span className="text-[8px] uppercase tracking-wider text-[var(--muted)]">score</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="tnum text-lg font-semibold">{inr(row.price)}</span>
          <span
            className="tnum text-xs font-medium"
            style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}
          >
            {pct(row.changePercent, 2, true)}
          </span>
        </div>
        <VerdictBadge verdict={row.verdict} />
      </div>

      {row.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {row.tags.map((t) => (
            <span
              key={t}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: `${TAG_COLOR[t]}22`, color: TAG_COLOR[t] }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-2.5 text-[11px]">
        <Mini label="1M" value={pct(row.roc20, 1, true)} tone={(row.roc20 ?? 0) >= 0} />
        <Mini label="RSI" value={row.rsi14 !== null ? row.rsi14.toFixed(0) : '—'} />
        <Mini label="Conf" value={`${row.confidence}%`} />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted-2)]">
          Backtest · 1yr
        </span>
        <BacktestStat winRate={row.btWinRate} trades={row.btTrades} expectancyR={row.btExpectancyR} />
      </div>
    </button>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p
        className="tnum font-medium"
        style={tone === undefined ? undefined : { color: tone ? 'var(--bull)' : 'var(--bear)' }}
      >
        {value}
      </p>
    </div>
  );
}

export default memo(StockCard);
