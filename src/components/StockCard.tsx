'use client';

import { memo } from 'react';
import type { ScreenRow } from '@/lib/screenAggregate';
import { inr, pct } from '@/lib/format';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';
import { BacktestStat } from './BacktestStat';
import { setupReason } from './StockRows';

function StockCard({ row, onClick }: { row: ScreenRow; onClick: (symbol: string) => void }) {
  return <article className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
    <div className="flex items-start justify-between gap-2">
      <button type="button" onClick={() => onClick(row.symbol)} aria-label={`Open ${row.name} report`} className="min-h-11 min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{row.name}</span><span className="mt-1 block text-xs text-[var(--muted)]">{row.symbol.replace(/\.(NS|BO)$/, '')} · {row.sector}</span></button>
      <StarButton symbol={row.symbol} name={row.name} size="sm" />
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="tnum text-xl font-medium">{inr(row.price)}</p><p className="tnum text-sm" style={{ color: row.changePercent >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{pct(row.changePercent, 2, true)} daily</p></div>
    <div className="mt-3 flex items-center justify-between gap-2"><VerdictBadge verdict={row.verdict} /><p className="tnum text-sm"><strong>{Math.round(row.score)}</strong><span className="text-[var(--muted)]"> /100 score</span></p></div>
    <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{setupReason(row)}</p>
    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-3 text-xs"><div><dt className="text-[var(--muted)]">1 month</dt><dd className="tnum mt-1">{pct(row.roc20, 1, true)}</dd></div><div><dt className="text-[var(--muted)]">RSI</dt><dd className="tnum mt-1">{row.rsi14?.toFixed(0) ?? '—'}</dd></div><div><dt className="text-[var(--muted)]">Confidence</dt><dd className="tnum mt-1">{row.confidence}/100</dd></div></dl>
    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">Confidence describes signal agreement, not profit probability.</p>
    <div className="mt-3 border-t border-[var(--border)] pt-3"><p className="mb-1 text-xs text-[var(--muted)]">Past-year simulation</p><BacktestStat winRate={row.btWinRate} trades={row.btTrades} expectancyR={row.btExpectancyR} /></div>
    <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">Yahoo prices are delayed. The weighted swing score has no demonstrated edge.</p>
    <button type="button" onClick={() => onClick(row.symbol)} className="mt-3 min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]">Read the evidence <span aria-hidden="true">↗</span></button>
  </article>;
}

export default memo(StockCard);
