'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { SymbolBacktest } from '@/lib/backtest';
import SignalBuckets from './SignalBuckets';
import { pct } from '@/lib/format';

// A history check is an explicit action. It can be expensive on a phone, so
// loading a stock report must never start one as a side effect.
type Resp =
  | { status: 'ready'; result: SymbolBacktest }
  | { status: 'pending'; startedAt: number }
  | { status: 'error'; error: string }
  | { error: string };

const POLL_MS = 2500;
const REQUEST_TIMEOUT_MS = 20_000;
const WAIT_LIMIT_MS = 180_000;

export default function BacktestPanel({ query, autoRun = false }: { query: string; autoRun?: boolean }) {
  const [data, setData] = useState<SymbolBacktest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<{ startedAt: number; retry: boolean } | null>(() => autoRun ? { startedAt: Date.now(), retry: false } : null);
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  function start(retry = false) {
    const startedAt = Date.now();
    setData(null);
    setError(null);
    setStopped(false);
    setNow(startedAt);
    setRequest({ startedAt, retry });
  }

  function stopWaiting() {
    setRequest(null);
    setStopped(true);
  }

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let retryNextRequest = request.retry;

    const deadline = setTimeout(() => {
      cancelled = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      setError('This check is taking longer than 3 minutes. It may still finish on the server. Try again to check for its result.');
      setRequest(null);
    }, Math.max(0, WAIT_LIMIT_MS - (Date.now() - request.startedAt)));

    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      requestTimer = timeout;
      try {
        const retryParam = retryNextRequest ? '&retry=1' : '';
        retryNextRequest = false;
        const res = await fetch(`/api/backtest?q=${encodeURIComponent(query)}${retryParam}`, { signal: controller.signal });
        const json = (await res.json()) as Resp;
        if (cancelled) return;

        if (!res.ok || 'error' in json) {
          setError('error' in json ? json.error : 'The history check could not finish.');
          setRequest(null);
          return;
        }
        if (json.status === 'ready') {
          setData(json.result);
          setRequest(null);
          return;
        }
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (cancelled) return;
        // A long computation can temporarily delay the status response. Keep
        // polling within the overall limit; the user can stop waiting at any time.
        if (controller.signal.aborted) {
          timer = setTimeout(poll, POLL_MS);
          return;
        }
        setError('Could not reach the history check. Check your connection and try again.');
        setRequest(null);
      } finally {
        clearTimeout(timeout);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(deadline);
      if (requestTimer) clearTimeout(requestTimer);
      if (timer) clearTimeout(timer);
    };
  }, [query, request]);

  // Display real waiting time, not an invented completion estimate.
  useEffect(() => {
    if (!request) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [request]);

  if (error) return <div className="px-5 py-4"><p role="alert" className="text-sm text-[var(--muted)]">{error}</p><button type="button" onClick={() => start(true)} className="mt-3 min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm">Retry history check</button></div>;
  if (!request && !data) return <div className="p-5"><p className="mb-4 text-sm text-[var(--muted)]">{stopped ? 'You stopped waiting. A check already started may continue on the server; you can check for its result again.' : 'See past trades, returns and losses after assumed costs. The first check can take longer on a phone.'}</p><button type="button" onClick={() => start()} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">{stopped ? 'Check for result' : 'Run history check'}</button></div>;
  if (!data) {
    const elapsedS = request ? Math.max(0, Math.floor((now - request.startedAt) / 1000)) : 0;
    return (
      <div className="space-y-3 p-5">
        <p className="text-sm font-semibold" role="status">Running history check</p>
        <p className="tnum text-2xl font-semibold" aria-live="off">{elapsedS}s <span className="text-sm font-normal text-[var(--muted)]">elapsed</span></p>
        <p className="text-sm leading-relaxed text-[var(--muted)]">Replaying past trading days. The exact time depends on the stock&apos;s history and your device; a reliable time remaining is not available.</p>
        {elapsedS >= 30 && <p className="text-sm text-[var(--muted)]" role="status">Still checking. You can read the rest of the report while this runs.</p>}
        <button type="button" onClick={stopWaiting} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm">Stop waiting</button>
        <p className="text-xs text-[var(--muted)]">Stops waiting on this screen. A check already started may continue on the server.</p>
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
