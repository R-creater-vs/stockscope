'use client';

import { useEffect, useMemo, useState } from 'react';
import SectorHeatmap from './SectorHeatmap';
import StockCard from './StockCard';
import BuyList from './BuyList';
import PriceFilter, { type PriceRange, ANY_PRICE } from './PriceFilter';
import { buildBuckets } from '@/lib/screenAggregate';
import type { MarketContext, ScreenRow, SectorStat } from '@/lib/screenAggregate';

interface ScreenResponse {
  market: MarketContext | null;
  sectors: SectorStat[];
  all: ScreenRow[];
  scanned: number;
  generatedAt: string;
}

export default function Discover({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('best');
  const [range, setRange] = useState<PriceRange>(ANY_PRICE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/screen');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error ?? 'Scan failed.');
        else setData(json as ScreenResponse);
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Price filtering re-buckets in the browser from the full row set — no server
  // round-trip, so it is instant. Memoised so it only recomputes when the rows
  // or the price band actually change, not on every unrelated re-render.
  const inRange = useMemo(
    () => (data ? data.all.filter((r) => r.price >= range.min && r.price <= range.max) : []),
    [data, range],
  );

  const buckets = useMemo(
    () => buildBuckets(inRange).filter((b) => b.rows.length > 0),
    [inRange],
  );

  const matched = inRange.length;

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--bear)]/40 bg-[var(--bear)]/5 px-5 py-4 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return <DiscoverSkeleton />;

  const current = buckets.find((b) => b.id === active) ?? buckets[0];

  return (
    <div className="mt-6 space-y-6">
      <SectorHeatmap sectors={data.sectors} onSelect={onSelect} />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Suggested stocks</h2>
          <span className="text-xs text-[var(--muted)]">
            {matched} of {data.scanned} in range
          </span>
        </div>

        <div className="mt-3">
          <PriceFilter value={range} onChange={setRange} />
        </div>

        <div className="mt-4">
          <BuyList rows={inRange} market={data.market} onSelect={onSelect} />
        </div>

        {buckets.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[var(--border)] px-5 py-8 text-center text-sm text-[var(--muted)]">
            No setups in this price range. Widen the filter to see more.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {buckets.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActive(b.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    current?.id === b.id
                      ? 'bg-[var(--accent)] text-white'
                      : 'border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {b.title}
                  <span className="ml-1.5 text-xs opacity-70">{b.rows.length}</span>
                </button>
              ))}
            </div>

            {current && (
              <>
                <p className="mt-3 text-sm text-[var(--muted)]">{current.blurb}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {current.rows.map((r) => (
                    <StockCard key={r.symbol} row={r} onClick={onSelect} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Scanned {data.scanned} liquid NSE stocks, refreshed every 15 minutes. Ranked by technical
        setup quality only — this is a starting point for your own research, not a recommendation.
      </p>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="h-24 animate-pulse rounded-xl bg-[var(--surface)]" />
      <div>
        <div className="h-5 w-40 animate-pulse rounded bg-[var(--surface)]" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-[var(--surface)]" />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-[var(--muted)]">Scanning 130 stocks…</p>
    </div>
  );
}
