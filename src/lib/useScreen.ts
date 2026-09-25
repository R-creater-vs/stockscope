'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketContext, ScreenRow, SectorStat } from './screenAggregate';

export interface ScreenData {
  market: MarketContext | null;
  sectors: SectorStat[];
  all: ScreenRow[];
  scanned: number;
  failed?: number;
  generatedAt: string;
}

export function useScreen() {
  const [data, setData] = useState<ScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/screen');
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.all)) throw new Error('The scan could not be loaded.');
      if (alive.current) { setData(json); setError(null); }
    } catch {
      if (alive.current) setError('The scan is unavailable. Check your connection and try again.');
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const first = setTimeout(() => { void refresh(); }, 0);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 900_000);
    const online = () => { void refresh(); };
    window.addEventListener('online', online);
    return () => { alive.current = false; clearTimeout(first); clearInterval(timer); window.removeEventListener('online', online); };
  }, [refresh]);
  return { data, error, loading, refresh };
}
