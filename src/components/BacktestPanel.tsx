'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { SymbolBacktest } from '@/lib/backtest';
import SignalBuckets from './SignalBuckets';
import { pct } from '@/lib/format';

/**
 * The backtest now replays a stock's ENTIRE history, not a trailing window —
 * for an old, liquid name that's tens of thousands of days, each re-running the
 * full engine, which can take a minute or more (measured ~80s for RELIANCE on
 * a desktop). The API runs it as a background job rather than blocking the
 * request, so this polls for the result instead of a single fetch-and-wait.
 */
type Resp =
  | { status: 'ready'; result: SymbolBacktest }
  | { status: 'pending'; startedAt: number }
  | { status: 'error'; error: string }
  | { error: string };

const POLL_MS = 2500;

export default function BacktestPanel({ query }: { query: string }) {
  const [data, setData] = useState<SymbolBacktest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/backtest?q=${encodeURIComponent(query)}`);
        const json = (await res.json()) as Resp;
        if (cancelled) return;

        if (!res.ok || 'error' in json) {
          setError('error' in json ? json.error : 'Backtest failed.');
          return;
        }
        if (json.status === 'ready') {
          setData(json.result);
          return;
        }
        setStartedAt(json.startedAt);
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (!cancelled) setError('Could not run the backtest.');
      }
    };

    (async () => {
      setData(null);
      setError(null);
      setStartedAt(null);
      await poll();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query, attempt]);

  // Ticks the elapsed-time readout while a job is in flight.
  useEffect(() => {
    if (data || error) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data, error]);

  if (error) return <div className="px-5 py-4"><p role="alert" className="text-sm text-[var(--muted)]">{error}</p><button onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm">Retry backtest</button></div>;
  if (!data) {
    const elapsedS = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
    return (
      <div className="space-y-2 p-4" role="status">
        <div aria-hidden="true" className="h-24 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        <p className="text-center text-xs text-[var(--muted)]">
          Replaying the engine since this stock&apos;s listing, one trading day at a time — older,
          long-listed names can take a minute or two the first time
          {elapsedS > 4 ? ` (${elapsedS}s so far)` : ''}. Cached after that, so it&apos;s instant for
          the rest of today.
        </p>
      </div>
    );
  }

  const s = data.stats;
  const beatHold = s.totalReturnPct > data.buyHoldReturnPct;
  const edge = s.expectancyR > 0.03 ? 'positive' : s.expectancyR < -0.03 ? 'negative' : 'flat';
  const edgeColor =
    edge === 'positive' ? 'var(--bull)' : edge === 'negative' ? 'var(--bear)' : 'var(--warn)';

  return (
    <div className="p-4">
      {/* Honest one-line verdict first. */}
      <div
        className="mb-4 rounded-lg px-4 py-3 text-sm"
        style={{ background: 'var(--surface-2)', color: 'var(--foreground)' }}
      >
        Over {data.from} → {data.to}, this strategy took{' '}
        <strong>{s.trades}</strong> trades on {data.symbol.replace('.NS', '')} with a{' '}
        <strong>{s.winRate.toFixed(0)}% win rate</strong> and an expectancy of{' '}
        <strong style={{ color: edgeColor }}>
          {s.expectancyR >= 0 ? '+' : ''}
          {s.expectancyR.toFixed(2)}R
        </strong>{' '}
        per trade — a <strong style={{ color: edgeColor }}>{edge} historical expectancy</strong>.
        <p className="mt-2 text-[var(--muted)]">This stock&apos;s history does not validate future returns. The weighted swing model has no demonstrated stable edge across its recorded universe tests.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trades" value={`${s.trades}`} />
        <Stat label="Win rate" value={`${s.winRate.toFixed(0)}%`} />
        <Stat
          label="Expectancy"
          value={`${s.expectancyR >= 0 ? '+' : ''}${s.expectancyR.toFixed(2)}R`}
          color={edgeColor}
        />
        <Stat
          label="Profit factor"
          value={isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}
          color={s.profitFactor >= 1 ? 'var(--bull)' : 'var(--bear)'}
        />
        <Stat
          label="Strategy return"
          value={pct(s.totalReturnPct, 1, true)}
          color={s.totalReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'}
        />
        <Stat
          label="Buy & hold"
          value={pct(data.buyHoldReturnPct, 1, true)}
          color={data.buyHoldReturnPct >= 0 ? 'var(--bull)' : 'var(--bear)'}
        />
        <Stat label="Max drawdown" value={pct(-s.maxDrawdownPct, 1)} color="var(--bear)" />
        <Stat label="Avg hold" value={`${s.avgHoldDays.toFixed(1)}d`} />
      </div>

      {data.equityCurve.length > 2 && (
        <div className="mt-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            Equity curve — ₹100 traded one position at a time
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data.equityCurve} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={beatHold ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={beatHold ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--muted)' }}
                formatter={(v) => [`₹${Number(v).toFixed(1)}`, 'Equity']}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={beatHold ? 'var(--bull)' : 'var(--bear)'}
                strokeWidth={1.6}
                fill="url(#eqFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Score and subsequent returns · this stock
        </p>
        <SignalBuckets buckets={data.signal.buckets} horizon={data.signal.horizon} />
        <p className="mt-2 text-xs text-[var(--muted)]">
          Score/return correlation for {data.symbol.replace('.NS', '')}:{' '}
          <span className="tnum" style={{ color: data.signal.correlation >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {data.signal.correlation >= 0 ? '+' : ''}
            {data.signal.correlation.toFixed(3)}
          </span>{' '}
          · net of {data.config.costPct}% round-trip cost · entries at next day&apos;s open.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{data.signal.samples.toLocaleString('en-IN')} daily signal observations; forward-return windows overlap. {data.config.holdMaxDays}-day maximum hold; engine stop and target. Signal buckets show price returns, while the trading simulation deducts assumed costs. Real liquidity, fills and costs can differ. This is a single-stock simulation, not a portfolio return.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5 text-base font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
