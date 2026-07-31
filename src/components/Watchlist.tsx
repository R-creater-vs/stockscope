'use client';

import { useEffect, useState } from 'react';
import { useWatchlist } from '@/lib/useWatchlist';
import StockCard from './StockCard';
import type { ScreenRow } from '@/lib/screenAggregate';

export default function Watchlist({ onSelect }: { onSelect: (symbol: string) => void }) {
  const { items, ready } = useWatchlist();
  const [rows, setRows] = useState<ScreenRow[] | null>(null);
  const [error, setError] = useState(false);

  const symbols = items.map((i) => i.symbol).join(',');

  // Re-fetch whenever the set of saved symbols changes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if (!symbols) {
        setRows([]);
        return;
      }
      setRows(null);
      setError(false);
      try {
        const res = await fetch(`/api/watch?symbols=${encodeURIComponent(symbols)}`);
        const data = await res.json();
        if (cancelled) return;
        setRows(data.rows ?? []);
        if (data.error) setError(true);
      } catch {
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbols, ready]);

  if (!ready) return null;

  if (items.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
        <p className="text-2xl">☆</p>
        <p className="mt-2 text-sm font-medium">Your watchlist is empty</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tap the star on any stock — in the suggestions or on its report — to keep an eye on it
          here. Saved on this device; no account needed.
        </p>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.symbol} className="h-40 animate-pulse rounded-xl bg-[var(--surface)]" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-3 text-xs text-[var(--warn)]">
          Some quotes could not be refreshed just now — showing what loaded.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <StockCard key={r.symbol} row={r} onClick={onSelect} />
        ))}
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        {rows.length} stock{rows.length === 1 ? '' : 's'} watched · sorted by setup score · stored
        in your browser.
      </p>
    </div>
  );
}
