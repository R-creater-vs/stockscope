'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/intraday?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setStatus((s) => (s === 'ok' ? 'ok' : 'error'));
          return;
        }
        const pts: Point[] = data.points ?? [];
        setPoints(pts);
        setPrevClose(typeof data.prevClose === 'number' ? data.prevClose : null);
        setAt(data.at ?? '');
        setStatus(pts.length ? 'ok' : 'empty');
      } catch {
        if (!cancelled) setStatus((s) => (s === 'ok' ? 'ok' : 'error'));
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
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Price today</h2>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}
            title="Real market data, delayed roughly 15 minutes by the free data source — fine for swing trading"
          >
            Delayed ~15m
          </span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="tnum text-2xl font-bold" style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>
            {inr(price)}
          </span>
          <span className="tnum text-sm font-medium" style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>
            {up ? '▲' : '▼'} {up ? '+' : ''}
            {change.toFixed(2)} ({up ? '+' : ''}
            {changePct.toFixed(2)}%)
          </span>
        </div>
      </header>

      <div className="px-1 pb-3 pt-4">
        {status === 'loading' ? (
          <div className="grid h-[180px] place-items-center">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span className="h-2 w-2 animate-ping rounded-full bg-[var(--accent)]" />
              Loading today&apos;s prices…
            </div>
          </div>
        ) : status === 'error' ? (
          <div className="grid h-[180px] place-items-center px-6 text-center">
            <p className="text-sm text-[var(--muted)]">Couldn&apos;t load intraday prices right now.</p>
          </div>
        ) : points.length < 2 ? (
          <div className="grid h-[180px] place-items-center px-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              No intraday movement yet — the market may be closed. The daily chart below has the full
              picture.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={points} margin={{ top: 6, right: 14, bottom: 0, left: 6 }}>
              <defs>
                <linearGradient id="intradayFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis
                domain={[lo - pad, hi + pad]}
                orientation="right"
                width={52}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Area
                type="monotone"
                dataKey="p"
                stroke={lineColor}
                strokeWidth={1.8}
                fill="url(#intradayFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        <p className="mt-1 px-4 text-[11px] text-[var(--muted-2)]">
          Today&apos;s session, 5-minute bars · real data, delayed ~15 min · refreshes every minute
          {at ? ` · updated ${new Date(at).toLocaleTimeString('en-IN')}` : ''}.
        </p>
      </div>
    </section>
  );
}
