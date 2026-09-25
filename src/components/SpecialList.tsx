'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScreenRow } from '@/lib/screenAggregate';
import PriceFilter, { type PriceRange } from './PriceFilter';
import { inr, relativeTime } from '@/lib/format';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';

const DEFAULT_RANGE: PriceRange = { label: '₹100–250', min: 100, max: 250 };
const MIN_TRADES = 8;
const TOP_N = 20;

export default function SpecialList({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [all, setAll] = useState<ScreenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<PriceRange>(DEFAULT_RANGE);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/screen', { signal });
      const json = (await res.json()) as { all?: ScreenRow[]; generatedAt?: string; error?: string };
      if (!res.ok || json.error || !Array.isArray(json.all)) throw new Error(json.error || 'The historical ranking could not be loaded.');
      if (!signal?.aborted) { setAll(json.all); setGeneratedAt(json.generatedAt ?? null); }
    } catch {
      if (!signal?.aborted) setError('The historical ranking could not be loaded. Check your connection and retry.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const ranked = useMemo(() => (all ?? []).filter(row => row.price >= range.min && row.price <= range.max && row.btTrades >= MIN_TRADES && row.btWinRate !== null)
    .sort((a, b) => b.btWinRate! - a.btWinRate! || (b.btExpectancyR ?? 0) - (a.btExpectancyR ?? 0)).slice(0, TOP_N), [all, range]);

  return <div className="space-y-5 py-5">
    <div className="border-l-2 border-[var(--accent)] pl-4"><h2 className="text-lg font-medium">Historical win-rate ranking</h2><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Past-year simulated swing trades, ranked by win rate, then expectancy. The existing filter requires {MIN_TRADES} trades; that remains a small sample and does not establish reliability. Historical selection can favour chance winners.</p><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]"><strong className="font-medium text-[var(--foreground)]">No demonstrated edge in the weighted swing score.</strong> These results assume 0.2% round-trip costs. Positive average returns in this selected history do not establish future profitability.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><PriceFilter value={range} onChange={setRange} /><button type="button" disabled={loading} onClick={() => void load()} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh ranking'}</button></div>
    {error && <p role="alert" className="text-sm text-[var(--bear)]">{error} {all && 'Previously loaded results remain visible.'}</p>}
    {all && <p className="text-xs leading-relaxed text-[var(--muted)]">{ranked.length} shown{ranked.length === TOP_N ? ` · top ${TOP_N}` : ''} · {all.length} successfully scored stocks{generatedAt && <> · scan <span title={new Date(generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'}>{relativeTime(generatedAt)}</span></>}. Yahoo prices are delayed; scan time is not exchange freshness.</p>}
    {!all && !error ? <div role="status" aria-label="Loading historical ranking" className="space-y-2">{[0, 1, 2].map(item => <div key={item} className="h-24 animate-pulse rounded-lg bg-[var(--surface)] motion-reduce:animate-none" />)}</div>
      : all && ranked.length === 0 ? <p className="rounded-xl border border-[var(--border)] px-5 py-8 text-sm leading-relaxed text-[var(--muted)]">No stocks in this price range have at least {MIN_TRADES} simulated trades. Widen the price range to inspect more of the sample.</p>
        : ranked.length > 0 && <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-label="Historical ranking results">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr_44px] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)] md:grid"><span>Company / price</span><span className="text-right">Historical win rate</span><span className="text-right">Average R / trade</span><span className="text-right">Latest rule reading</span><span /></div>
          <ol className="divide-y divide-[var(--border)]">{ranked.map((row, index) => <li key={row.symbol} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2 px-3 py-3 sm:px-5">
            <button type="button" onClick={() => onSelect(row.symbol)} aria-label={`Rank ${index + 1}: open ${row.name} report`} className="grid min-h-11 grid-cols-2 items-center gap-x-4 gap-y-3 rounded-lg py-1 text-left md:grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr]">
              <div className="min-w-0"><p className="truncate text-sm font-semibold"><span className="mr-2 text-xs font-normal text-[var(--muted)]">{index + 1}.</span>{row.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{row.symbol.replace(/\.(NS|BO)$/, '')} · {row.sector}</p><p className="tnum mt-1 text-sm">{inr(row.price)}</p></div>
              <div className="text-right"><p className="tnum text-xl font-medium">{row.btWinRate?.toFixed(1)}%</p><p className="mt-1 text-xs text-[var(--muted)]">win · {row.btTrades} trades</p></div>
              <div className="md:text-right"><p className="tnum text-base font-medium" style={{ color: row.btExpectancyR === null ? 'var(--muted)' : row.btExpectancyR >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{row.btExpectancyR === null ? 'Unavailable' : `${row.btExpectancyR > 0 ? '+' : ''}${row.btExpectancyR.toFixed(2)}R`}</p><p className="mt-1 text-xs text-[var(--muted)]">average per trade</p></div>
              <div className="text-right"><VerdictBadge verdict={row.verdict} /><p className="tnum mt-2 text-xs text-[var(--muted)]">Score {row.score.toFixed(1)}/100</p></div>
            </button>
            <StarButton symbol={row.symbol} name={row.name} />
          </li>)}</ol>
          <p className="border-t border-[var(--border)] px-5 py-4 text-xs leading-relaxed text-[var(--muted)]">R expresses return relative to the planned initial risk. A high win rate can coexist with losses. The latest rule reading describes current available technical inputs; it is separate from this historical ranking.</p>
        </section>}
  </div>;
}
