'use client';

import { memo, useMemo, useState } from 'react';
import { aggregateBacktest, isHighConviction, type BacktestAgg, type MarketContext, type ScreenRow } from '@/lib/screenAggregate';
import StockRows from './StockRows';

function BuyList({ rows, market, onSelect, limit = 12 }: { rows: ScreenRow[]; market: MarketContext | null; onSelect: (symbol: string) => void; limit?: number }) {
  const [mode, setMode] = useState<'all' | 'aligned'>('all');
  const bullish = useMemo(() => rows.filter(row => row.verdict === 'BUY' || row.verdict === 'STRONG_BUY').sort((a, b) => b.score - a.score), [rows]);
  const aligned = useMemo(() => rows.filter(row => isHighConviction(row, market)).sort((a, b) => b.score - a.score), [rows, market]);
  const bullishAgg = useMemo(() => aggregateBacktest(bullish), [bullish]);
  const alignedAgg = useMemo(() => aggregateBacktest(aligned), [aligned]);
  const selected = mode === 'aligned' ? aligned : bullish;
  const shown = selected.slice(0, limit);

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Bullish rule readings</h2><div className="flex flex-wrap gap-2" aria-label="Bullish reading filters"><button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--background)]">All bullish · {bullish.length}</button><button type="button" aria-pressed={mode === 'aligned'} onClick={() => setMode('aligned')} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--background)]">Timeframes aligned · {aligned.length}</button></div></header>
    <p className="border-l-2 border-[var(--accent)] pl-4 text-sm leading-relaxed text-[var(--muted)]"><strong className="font-medium text-[var(--foreground)]">No demonstrated edge in the weighted swing score.</strong> These are technical rule readings, not recommendations to buy. Confidence measures agreement and trend clarity, not profit probability.</p>
    {mode === 'aligned' && <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><p className="text-sm leading-relaxed text-[var(--muted)]">Existing filter: bullish swing, mid-term and long price-trend proxy; confidence at least 55; planned reward:risk at least 1.3; index above its 50-day average when market context is available. This does not establish better future returns.</p>{!market && <p className="text-sm text-[var(--warn)]">Market context is unavailable. The existing filter skips the index condition in this case, so market alignment is unconfirmed.</p>}<div className="grid gap-4 sm:grid-cols-2"><AggReadout label="Aligned sample" agg={alignedAgg} /><AggReadout label="All bullish sample" agg={bullishAgg} /></div><p className="text-xs leading-relaxed text-[var(--muted)]">These pools use stocks selected by their latest available readings. Their past-year simulations are descriptive history, not an out-of-sample test of this filter.</p></div>}
    {shown.length ? <StockRows rows={shown} onSelect={onSelect} /> : <p className="rounded-xl border border-[var(--border)] px-5 py-8 text-sm text-[var(--muted)]">{mode === 'aligned' && market && !market.above50 ? 'The index is below its 50-day average, so no stocks meet the alignment filter.' : 'No stocks meet this filter in the current selection.'}</p>}
    <p className="text-xs leading-relaxed text-[var(--muted)]">Showing {shown.length} of {selected.length} matching stocks, sorted by technical score. Historical simulations assume 0.2% round-trip costs. Samples are limited; the selected history is not a forecast. Yahoo prices are delayed.</p>
  </section>;
}

function AggReadout({ label, agg }: { label: string; agg: BacktestAgg }) {
  return <div><h3 className="text-sm font-medium">{label}</h3><p className="tnum mt-1 text-sm text-[var(--muted)]">{agg.stocks} stocks · {agg.trades} simulated trades</p>{agg.trades > 0 ? <><p className="tnum mt-1 text-sm">{agg.winRate.toFixed(1)}% win · {agg.expectancyR > 0 ? '+' : ''}{agg.expectancyR.toFixed(2)}R per trade</p><p className="tnum mt-1 text-xs text-[var(--muted)]">{agg.positiveShare.toFixed(0)}% of tested names had positive expectancy</p></> : <p className="mt-1 text-sm text-[var(--muted)]">No simulated trades in this sample.</p>}</div>;
}

export default memo(BuyList);
