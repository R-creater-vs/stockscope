'use client';

import { useEffect, useState } from 'react';
import type { MarketContext } from '@/lib/screenAggregate';
import { num, pct } from '@/lib/format';

/**
 * The market regime, pinned at the top of the whole app — because the single
 * biggest honest edge in the backtests was simply NOT buying into a falling
 * index. One glance answers "should I even be shopping for longs today?" before
 * any individual stock is on screen.
 */

const TONE: Record<
  MarketContext['regime'],
  { color: string; rgb: string; verb: string; action: string }
> = {
  Bullish: {
    color: 'var(--bull)',
    rgb: '38,208,124',
    verb: 'Trade with the trend',
    action: 'the index is above its 20 & 50-day averages — long setups have the wind behind them.',
  },
  Neutral: {
    color: 'var(--warn)',
    rgb: '246,167,35',
    verb: 'Be selective',
    action: 'mixed tape — keep size small and only take the cleanest setups.',
  },
  Bearish: {
    color: 'var(--bear)',
    rgb: '246,70,93',
    verb: 'Sit on your hands',
    action: 'the index is below its averages — not trading a downtrend was the biggest edge in the data.',
  },
};

export default function RegimeBanner() {
  const [market, setMarket] = useState<MarketContext | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/market');
        const data = (await res.json()) as { market: MarketContext | null };
        if (!cancelled) {
          setMarket(data.market);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show until we know the regime (avoids a flash of empty bar).
  if (!loaded || !market) return null;

  const tone = TONE[market.regime];
  const up = market.changePercent >= 0;

  return (
    <div
      className="border-b"
      style={{
        borderColor: `rgba(${tone.rgb},0.25)`,
        background: `linear-gradient(90deg, rgba(${tone.rgb},0.10), transparent 70%)`,
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: tone.color }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: tone.color }} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: tone.color }}>
            {market.regime}
          </span>
        </span>

        <span className="tnum text-xs text-[var(--muted)]">
          {market.name} {num(market.price, 0)}{' '}
          <span style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>
            {pct(market.changePercent, 2, true)}
          </span>
        </span>

        <span className="hidden text-xs text-[var(--muted)] sm:inline" aria-hidden>
          ·
        </span>

        <span className="text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">{tone.verb}</span> — {tone.action}
        </span>
      </div>
    </div>
  );
}
