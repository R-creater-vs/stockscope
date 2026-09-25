'use client';

import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { inr } from '@/lib/format';

/**
 * The "price today" chart: the latest session's real intraday line, refreshed
 * every minute. The data is Yahoo-delayed (~15 min), stated plainly — which is
 * entirely fine for weeks-to-weeks swing trading, so there's no broker feed and
 * nothing simulated here. Mounted with key={symbol} so switching stocks resets it.
 */

interface Point {
  t: number;
  p: number;
}

type Status = 'loading' | 'ok' | 'empty' | 'error';

export default function LiveChart({
  symbol,
  fallbackPrice,
}: {
  symbol: string;
  fallbackPrice: number;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [at, setAt] = useState<string>('');
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/intraday?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setStale(true);
          setStatus((s) => (s === 'ok' ? 'ok' : 'error'));
          return;
        }
        const pts: Point[] = data.points ?? [];
        setPoints(pts);
        setPrevClose(typeof data.prevClose === 'number' ? data.prevClose : null);
        setAt(data.at ?? '');
        setStatus(pts.length ? 'ok' : 'empty');
        setStale(false);
      } catch {
        if (!cancelled) { setStale(true); setStatus((s) => (s === 'ok' ? 'ok' : 'error')); }
      }
    };

    load();
    // Delayed data, so a once-a-minute poll is plenty. Pause while hidden; refresh
    // the moment the app returns to the foreground.
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [symbol]);

  const price = points.length ? points[points.length - 1].p : fallbackPrice;
  const base = prevClose ?? points[0]?.p ?? price;
  const change = price - base;
  const changePct = base ? (change / base) * 100 : 0;
  const up = change >= 0;
  const lineColor = up ? 'var(--bull)' : 'var(--bear)';

  const ps = points.map((d) => d.p);
  const lo = ps.length ? Math.min(...ps) : price;
  const hi = ps.length ? Math.max(...ps) : price;
  const pad = (hi - lo) * 0.15 || price * 0.002 || 1;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" aria-label="Latest session price chart">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Latest session</h2>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs"
            style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}
            title="Yahoo prices are delayed. The displayed candle time describes the data; retrieval time only describes the last request."
          >
            Yahoo · delayed
          </span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="tnum text-2xl font-bold" style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>
            {inr(price)}
          </span>
          {points.length > 0 && <span className="tnum text-sm font-medium" style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>
            {up ? '▲' : '▼'} {up ? '+' : ''}
            {change.toFixed(2)} ({up ? '+' : ''}
            {changePct.toFixed(2)}%)
          </span>}
        </div>
      </header>

      <div className="px-1 pb-3 pt-4">
        {status === 'loading' ? (
          <div role="status" className="grid h-[180px] place-items-center">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Loading the latest available session…
            </div>
          </div>
        ) : status === 'error' ? (
          <div className="grid h-[180px] place-items-center px-6 text-center">
            <p className="text-sm text-[var(--muted)]">Couldn&apos;t load intraday prices right now.</p>
          </div>
        ) : points.length < 2 ? (
          <div className="grid h-[180px] place-items-center px-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              Not enough intraday observations to draw a chart. Use the daily price history for context.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={points} margin={{ top: 6, right: 14, bottom: 0, left: 6 }} accessibilityLayer>
              <YAxis
                domain={[lo - pad, hi + pad]}
                orientation="right"
                width={52}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }} formatter={(value) => [inr(Number(value)), 'Price']} labelFormatter={(_, payload) => payload[0]?.payload?.t ? new Date(payload[0].payload.t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) + ' IST' : ''} />
              <Line
                type="monotone"
                dataKey="p"
                stroke={lineColor}
                strokeWidth={1.8}
                isAnimationActive={false}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <p className="mt-2 px-4 text-xs leading-relaxed text-[var(--muted)]">
          5-minute observations · checks every 60s · prices remain delayed.
          {points.length > 0 && ` Change measured from ${prevClose === null ? 'the first available session observation' : 'previous close'}.`}
        </p>
        {points.length > 0 && <p className="mt-1 px-4 text-xs text-[var(--muted)]">Latest candle: {new Date(points[points.length - 1].t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST.</p>}
        {at && <p className="mt-1 px-4 text-xs text-[var(--muted)]">Retrieved {new Date(at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Retrieval time is not market-data freshness.</p>}
        {stale && points.length > 0 && <p role="status" className="mt-2 px-4 text-xs text-[var(--warn)]">Refresh failed. The chart shows the last received observations.</p>}
        {points.length > 1 && <p className="sr-only">Price ranged from {inr(lo)} to {inr(hi)} in this session. Last observation {inr(price)}, {up ? 'up' : 'down'} {Math.abs(changePct).toFixed(2)} percent from {prevClose === null ? 'the first observation' : 'previous close'}.</p>}
      </div>
    </section>
  );
}
