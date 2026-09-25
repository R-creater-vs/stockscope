'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWatchlist } from '@/lib/useWatchlist';
import { useAlerts } from '@/lib/useAlerts';
import { inr, pct } from '@/lib/format';
import type { ScreenRow } from '@/lib/screenAggregate';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';

interface WatchState {
  rows: ScreenRow[];
  changes: Record<string, number>;
  missing: string[];
  loading: boolean;
  checkedAt: number | null;
  error: string | null;
}

export default function Watchlist({ onSelect, onDiscover, active = true }: { onSelect: (symbol: string) => void; onDiscover?: () => void; active?: boolean }) {
  const { items, ready, error: savedError, busy, reload } = useWatchlist();
  const { alerts, ready: alertsReady, error: alertsError } = useAlerts();
  const [state, setState] = useState<WatchState>({ rows: [], changes: {}, missing: [], loading: false, checkedAt: null, error: null });
  const [sort, setSort] = useState('score');
  const previousScores = useRef(new Map<string, number>());
  const request = useRef<AbortController | null>(null);
  const symbols = items.map((item) => item.symbol).join(',');

  const refresh = useCallback(async () => {
    if (!symbols || !ready) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((old) => ({ ...old, loading: true, error: null }));
    try {
      const res = await fetch(`/api/watch?symbols=${encodeURIComponent(symbols)}`, { signal: controller.signal, cache: 'no-store' });
      const data = (await res.json()) as { rows?: ScreenRow[]; error?: string };
      if (!res.ok || data.error || !Array.isArray(data.rows)) throw new Error(data.error || 'Refresh failed.');
      if (controller.signal.aborted) return;
      const rows = data.rows;
      const changes: Record<string, number> = {};
      for (const row of rows) {
        const previous = previousScores.current.get(row.symbol);
        if (previous !== undefined) changes[row.symbol] = row.score - previous;
        previousScores.current.set(row.symbol, row.score);
      }
      setState({ rows, changes, missing: symbols.split(',').filter((symbol) => !rows.some((row) => row.symbol === symbol)), loading: false, checkedAt: Date.now(), error: null });
    } catch {
      if (!controller.signal.aborted) setState((old) => ({ ...old, loading: false, error: 'Scores could not be refreshed. Previously loaded values may be stale.' }));
    }
  }, [symbols, ready]);

  useEffect(() => {
    if (!active) return;
    const first = window.setTimeout(() => { void refresh(); }, 0);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 180_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); request.current?.abort(); };
  }, [refresh, active]);

  const rowsBySymbol = new Map(state.rows.map((row) => [row.symbol, row]));
  const sorted = [...items].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : sort === 'change'
      ? (state.changes[b.symbol] ?? 0) - (state.changes[a.symbol] ?? 0)
      : (rowsBySymbol.get(b.symbol)?.score ?? -1) - (rowsBySymbol.get(a.symbol)?.score ?? -1));
  const changed = Object.values(state.changes).filter((change) => change !== 0).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-xl font-medium">Saved research</h2>
        {items.length > 0 && <button type="button" disabled={state.loading} onClick={() => void refresh()} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50">{state.loading ? 'Refreshing…' : 'Refresh scores'}</button>}
      </header>

      {savedError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--bear)] p-4 text-sm"><p>{savedError}</p><button type="button" disabled={busy} onClick={() => void reload()} className="min-h-11 px-3 underline">Retry saved list</button></div>}

      {!ready ? <div role="status" aria-label="Loading your watchlist" className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-[var(--surface)] motion-reduce:animate-none" />)}</div>
        : items.length === 0 && !savedError ? <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 sm:px-10">
          <span aria-hidden="true" className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] text-2xl text-[var(--accent)]">☆</span>
          <h2 className="text-xl font-medium">Give your research a place to return to.</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">Save a stock from Discover or its report. Its latest available score, changes and alert rules will appear here.</p>
          {onDiscover && <button type="button" onClick={onDiscover} className="mt-6 min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--background)]">Discover stocks <span aria-hidden="true">↗</span></button>}
          <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">Saved on the server for your browser identity. Sign in to carry your watchlist across devices.</p>
        </section> : items.length > 0 && <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--border)] py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"><p><span className="tnum font-semibold">{items.length}</span> <span className="text-[var(--muted)]">saved stocks</span></p><p><span className="tnum font-semibold">{changed}</span> <span className="text-[var(--muted)]">score changes</span></p></div>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">Sort by <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"><option value="score">Technical score</option><option value="change">Score change</option><option value="name">Company name</option></select></label>
          </div>
          <div className="space-y-2 text-xs leading-relaxed text-[var(--muted)]" aria-live="polite">
            <p>{state.checkedAt ? `Last retrieval ${new Date(state.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST.` : 'Retrieving available scores.'} Checks every 3 minutes while this view is visible.</p>
            <p>Yahoo prices are delayed. Retrieval time is not exchange freshness; quote timestamps are unavailable here. Changes compare consecutive successful loads in this view.</p>
            {state.error && <p role="alert" className="text-[var(--bear)]">{state.error}</p>}
            {state.missing.length > 0 && <p className="text-[var(--warn)]">{state.missing.length} saved stock{state.missing.length === 1 ? '' : 's'} could not be scored. They remain saved below.</p>}
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-busy={state.loading}>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.7fr)_1fr_1fr_1fr_44px] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs uppercase tracking-wider text-[var(--muted)] md:grid"><span>Company / setup</span><span className="text-right">Price / daily move</span><span className="text-right">Score / change</span><span className="text-right">Monitoring</span><span /></div>
            <ul className="divide-y divide-[var(--border)]">
              {sorted.map((item) => {
                const row = rowsBySymbol.get(item.symbol);
                const rules = alerts.filter((alert) => alert.symbol === item.symbol).length;
                const delta = state.changes[item.symbol];
                return <li key={item.symbol} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 px-3 py-3 sm:px-5">
                  <button type="button" onClick={() => onSelect(item.symbol)} aria-label={`Open ${item.name} intelligence report`} className="grid min-h-11 grid-cols-2 items-center gap-x-4 gap-y-3 rounded-lg py-1 text-left md:grid-cols-[minmax(0,1.7fr)_1fr_1fr_1fr]">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.symbol.replace(/\.(NS|BO)$/, '')} · {item.symbol.endsWith('.BO') ? 'BSE' : 'NSE'}</p>{row && <p className="mt-1 text-xs text-[var(--muted)]">{row.tags.join(' · ') || 'No named setup'}</p>}</div>
                    <div className="text-right">{row ? <><p className="tnum text-base font-medium">{inr(row.price)}</p><p className="tnum mt-1 text-xs" style={{ color: row.changePercent >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{pct(row.changePercent, 2, true)} daily</p></> : <p className="text-xs text-[var(--muted)]">{state.loading ? 'Loading score…' : 'Score unavailable'}</p>}</div>
                    <div className="md:text-right">{row ? <><p className="tnum text-sm"><span className="text-xl font-semibold">{Math.round(row.score)}</span><span className="text-[var(--muted)]"> /100</span></p><p className="mt-1 text-xs text-[var(--muted)]">{delta === undefined ? 'First reading' : delta === 0 ? 'Score unchanged' : `${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))} score points`}</p></> : <p className="text-xs text-[var(--muted)]">Open report to retry</p>}</div>
                    <div className="text-right">{row && <VerdictBadge verdict={row.verdict} />}<p className="mt-2 text-xs text-[var(--muted)]">{!alertsReady ? 'Checking alerts…' : alertsError ? 'Alert status unavailable' : rules ? `${rules} alert rule${rules === 1 ? '' : 's'}` : 'No alert rules'}</p></div>
                  </button>
                  <StarButton symbol={item.symbol} name={item.name} />
                </li>;
              })}
            </ul>
          </div>
          <p className="border-l-2 border-[var(--accent)] pl-4 text-sm leading-relaxed text-[var(--muted)]"><strong className="font-medium text-[var(--foreground)]">Research, with perspective.</strong> Existing testing has not demonstrated an edge for the weighted swing score. A rising score describes the rules, not a forecast of profit.</p>
          <p className="text-xs text-[var(--muted)]">Server saved · tied to your browser identity, or your account when signed in.</p>
        </>}
    </div>
  );
}
