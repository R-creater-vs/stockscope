'use client';

import { memo, useMemo, useState } from 'react';
import type { MarketContext, ScreenRow } from '@/lib/screenAggregate';
import type { Verdict } from '@/lib/swing';
import { aggregateBacktest, isHighConviction } from '@/lib/screenAggregate';
import { inr, pct } from '@/lib/format';
import StarButton from './StarButton';
import { VerdictBadge } from './VerdictBadge';
import { BacktestStat } from './BacktestStat';

/**
 * "Stocks you can buy" — the actionable shortlist, in two modes:
 *
 *  • All buys — every name on a BUY / STRONG BUY verdict, ranked by score.
 *  • High conviction — only where the market is in an uptrend AND all three
 *    timeframes agree AND confidence/reward:risk clear the bar. Fewer, stricter,
 *    and shown WITH its honest past-year backtest next to the plain buy list's,
 *    so the filter has to earn its keep rather than just look impressive.
 *
 * This is the honest version of "raise the success rate": stack legitimate,
 * a-priori filters, then show exactly how much (or little) they helped.
 */
const isBuy = (v: Verdict) => v === 'BUY' || v === 'STRONG_BUY';

function BuyList({
  rows,
  market,
  onSelect,
  limit = 12,
}: {
  rows: ScreenRow[];
  market: MarketContext | null;
  onSelect: (symbol: string) => void;
  limit?: number;
}) {
  const [mode, setMode] = useState<'all' | 'conviction'>('all');

  const buys = useMemo(
    () => rows.filter((r) => isBuy(r.verdict)).sort((a, b) => b.score - a.score),
    [rows],
  );
  const conviction = useMemo(
    () => rows.filter((r) => isHighConviction(r, market)).sort((a, b) => b.score - a.score),
    [rows, market],
  );

  const list = mode === 'conviction' ? conviction : buys;
  const shown = list.slice(0, limit);

  const convAgg = useMemo(() => aggregateBacktest(conviction), [conviction]);
  const buysAgg = useMemo(() => aggregateBacktest(buys), [buys]);

  const marketDown = mode === 'conviction' && market !== null && !market.above50;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--bull)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Stocks you can buy</h2>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          <Toggle active={mode === 'all'} onClick={() => setMode('all')}>
            All buys <span className="opacity-60">{buys.length}</span>
          </Toggle>
          <Toggle active={mode === 'conviction'} onClick={() => setMode('conviction')}>
            High conviction <span className="opacity-60">{conviction.length}</span>
          </Toggle>
        </div>
      </header>

      {mode === 'conviction' && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/40 px-5 py-3">
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">The filter:</span> index in an
            uptrend · short, mid &amp; long trend all pointing up · confidence ≥55 · reward:risk ≥1.3.
            Every rule is set in advance — none peeks at the backtest — so the numbers below are a
            fair test of whether it helped.
          </p>
          {conviction.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
              <AggReadout label="High conviction" agg={convAgg} highlight />
              <span className="text-[var(--muted-2)]">vs</span>
              <AggReadout label="All buys" agg={buysAgg} />
            </div>
          )}
        </div>
      )}

      {marketDown ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
          The index is <span className="text-[var(--bear)]">below its 50-day average</span> — high
          conviction stays flat. Sitting out a downtrend <em>is</em> the filter working; the biggest
          way to raise your win rate is to not trade into a falling market.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
          {mode === 'conviction'
            ? 'Nothing clears the high-conviction bar right now. “Nothing to do” is a valid, and often profitable, answer.'
            : 'Nothing on a buy signal in this price range. Widen the price filter, or check the setups below.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <th className="py-2.5 pl-5 pr-3 font-medium">Stock</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">1D</th>
                <th className="px-3 py-2.5 text-right font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Call</th>
                <th className="px-3 py-2.5 text-center font-medium" title="Do short / mid / long trends agree?">
                  Trend
                </th>
                <th className="px-3 py-2.5 text-right font-medium" title="Past-year backtest of this stock's swing setups">
                  Backtest · 1yr
                </th>
                <th className="py-2.5 pl-3 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onSelect(r.symbol)}
                  className="cursor-pointer border-b border-[var(--border)] transition last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="py-3 pl-5 pr-3">
                    <div className="font-medium leading-tight">{r.name}</div>
                    <div className="tnum text-[11px] text-[var(--muted)]">
                      {r.symbol.replace('.NS', '')} · {r.sector}
                    </div>
                  </td>
                  <td className="tnum px-3 py-3 text-right font-medium">{inr(r.price)}</td>
                  <td
                    className="tnum px-3 py-3 text-right"
                    style={{ color: r.changePercent >= 0 ? 'var(--bull)' : 'var(--bear)' }}
                  >
                    {pct(r.changePercent, 1, true)}
                  </td>
                  <td className="tnum px-3 py-3 text-right font-semibold">{Math.round(r.score)}</td>
                  <td className="px-3 py-3">
                    <VerdictBadge verdict={r.verdict} />
                  </td>
                  <td className="px-3 py-3">
                    <TrendAgreement row={r} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <BacktestStat winRate={r.btWinRate} trades={r.btTrades} expectancyR={r.btExpectancyR} />
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <StarButton symbol={r.symbol} name={r.name} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--muted)]">
        &ldquo;Backtest · 1yr&rdquo; is how each stock&apos;s swing setups did over the past year (net
        of costs, no look-ahead) — small samples, shown as honest context, not a recommendation or a
        promise. A tighter filter cannot make the future certain; it can only stack the odds and keep
        you out of the worst spots.
      </p>
    </section>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 font-medium transition ${
        active ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
      }`}
    >
      {children}
    </button>
  );
}

/** Three letters — S / M / L — green when that timeframe's trend is a buy. */
function TrendAgreement({ row }: { row: ScreenRow }) {
  const items: [string, Verdict][] = [
    ['S', row.verdict],
    ['M', row.midVerdict],
    ['L', row.longTrendVerdict],
  ];
  return (
    <div className="flex items-center justify-center gap-1">
      {items.map(([letter, v]) => {
        const on = isBuy(v);
        return (
          <span
            key={letter}
            title={`${letter === 'S' ? 'Short' : letter === 'M' ? 'Mid' : 'Long'} trend: ${v.replace('_', ' ')}`}
            className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold"
            style={{
              color: on ? 'var(--bull)' : 'var(--muted-2)',
              background: on ? 'color-mix(in srgb, var(--bull) 15%, transparent)' : 'var(--surface-2)',
            }}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

function AggReadout({
  label,
  agg,
  highlight,
}: {
  label: string;
  agg: { winRate: number; expectancyR: number; positiveShare: number; stocks: number };
  highlight?: boolean;
}) {
  const good = agg.expectancyR > 0;
  return (
    <span className={highlight ? 'font-medium text-[var(--foreground)]' : 'text-[var(--muted)]'}>
      {label}:{' '}
      <span className="tnum">{agg.winRate.toFixed(0)}% win</span> ·{' '}
      <span className="tnum" style={{ color: good ? 'var(--bull)' : 'var(--bear)' }}>
        {agg.expectancyR > 0 ? '+' : ''}
        {agg.expectancyR.toFixed(2)}R
      </span>{' '}
      <span className="text-[var(--muted-2)]">({agg.positiveShare.toFixed(0)}% of names +ve)</span>
    </span>
  );
}

export default memo(BuyList);
