'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScreenRow } from '@/lib/screenAggregate';
import PriceFilter, { type PriceRange } from './PriceFilter';
import { inr } from '@/lib/format';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';

/**
 * The Special list: the app's highest historical success rates, auto-curated
 * from the scan. Ranked by win rate (the "success rate" you asked for) over the
 * past year, but with a floor on trade count so a lucky 2-trade fluke never
 * tops the board — and with expectancy shown right beside it, because a high win
 * rate with big losses still loses money. Past performance, not a forecast.
 */

const DEFAULT_RANGE: PriceRange = { label: '₹100–250', min: 100, max: 250 };
const MIN_TRADES = 8; // enough of a sample to mean something
const TOP_N = 20;

export default function SpecialList({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [all, setAll] = useState<ScreenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<PriceRange>(DEFAULT_RANGE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/screen');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? 'Scan failed.');
        else setAll(json.all as ScreenRow[]);
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(() => {
    if (!all) return [];
    return all
      .filter(
        (r) =>
          r.price >= range.min &&
          r.price <= range.max &&
          r.btTrades >= MIN_TRADES &&
          r.btWinRate !== null,
      )
      .sort((a, b) => b.btWinRate! - a.btWinRate! || (b.btExpectancyR ?? 0) - (a.btExpectancyR ?? 0))
      .slice(0, TOP_N);
  }, [all, range]);

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--bear)]/40 bg-[var(--bear)]/5 px-5 py-4 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* The honesty guardrail, up top and unmissable. */}
      <div className="rounded-xl border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-[var(--warn)]">★</span>
          <h2 className="text-sm font-semibold uppercase tracking-wider">Special list — highest success rate</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          The stocks whose swing setups won most often over the past year (net of ~0.2% costs, no
          look-ahead), min {MIN_TRADES} trades so it isn&apos;t a fluke.{' '}
          <span className="text-[var(--foreground)]">A high win rate is not a promise of profit</span>{' '}
          — a stock can win often and still lose money if the losses are bigger, so the expectancy
          (R per trade) sits right next to it. This is history for research, not a forecast, and not a
          recommendation.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PriceFilter value={range} onChange={setRange} />
        {all && (
          <span className="text-xs text-[var(--muted)]">
            {ranked.length} shown{ranked.length === TOP_N ? ` (top ${TOP_N})` : ''}
          </span>
        )}
      </div>

      {!all ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface)]" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-5 py-10 text-center text-sm text-[var(--muted)]">
          No stocks with a meaningful track record in this price range. Widen the price filter — or
          accept that a short, honest list beats a long, padded one.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <th className="py-2.5 pl-5 pr-2 font-medium">#</th>
                  <th className="px-2 py-2.5 font-medium">Stock</th>
                  <th className="px-3 py-2.5 text-right font-medium">Price</th>
                  <th className="px-3 py-2.5 text-right font-medium">Success rate</th>
                  <th className="px-3 py-2.5 text-right font-medium">Expectancy</th>
                  <th className="px-3 py-2.5 font-medium">Now</th>
                  <th className="py-2.5 pl-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const good = (r.btExpectancyR ?? 0) > 0;
                  return (
                    <tr
                      key={r.symbol}
                      onClick={() => onSelect(r.symbol)}
                      className="cursor-pointer border-b border-[var(--border)] transition last:border-0 hover:bg-[var(--surface-2)]"
                    >
                      <td className="tnum py-3 pl-5 pr-2 text-[var(--muted-2)]">{i + 1}</td>
                      <td className="px-2 py-3">
                        <div className="font-medium leading-tight">{r.name}</div>
                        <div className="tnum text-[11px] text-[var(--muted)]">
                          {r.symbol.replace('.NS', '')} · {r.sector}
                        </div>
                      </td>
                      <td className="tnum px-3 py-3 text-right font-medium">{inr(r.price)}</td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className="tnum text-base font-bold"
                          style={{ color: good ? 'var(--bull)' : 'var(--muted)' }}
                        >
                          {r.btWinRate}%
                        </span>
                        <span className="tnum block text-[10px] text-[var(--muted-2)]">
                          {r.btTrades} trades
                        </span>
                      </td>
                      <td
                        className="tnum px-3 py-3 text-right font-medium"
                        style={{ color: good ? 'var(--bull)' : 'var(--bear)' }}
                      >
                        {(r.btExpectancyR ?? 0) > 0 ? '+' : ''}
                        {(r.btExpectancyR ?? 0).toFixed(2)}R
                      </td>
                      <td className="px-3 py-3">
                        <VerdictBadge verdict={r.verdict} size="xs" />
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <StarButton symbol={r.symbol} name={r.name} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--muted)]">
            Green success rate = the wins also made money (positive expectancy). Grey = won often but
            barely broke even or lost. &ldquo;Now&rdquo; is today&apos;s live verdict — a great past
            record and a buy today are different things. Star any name to save it to your watchlist.
          </p>
        </section>
      )}
    </div>
  );
}
