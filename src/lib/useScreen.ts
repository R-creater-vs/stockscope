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

export function useScreen(active = true) {
  const [data, setData] = useState<ScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const res = await fetch('/api/screen', { signal: controller.signal });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.all)) throw new Error('The scan could not be loaded.');
      if (!controller.signal.aborted) { setData(json); setError(null); }
    } catch {
      if (!controller.signal.aborted) setError('The scan is unavailable. Check your connection and try again.');
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    // Give URL restoration time to open a directly linked report before scanning.
    const first = setTimeout(() => { void refresh(); }, 150);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 900_000);
    const online = () => { void refresh(); };
    window.addEventListener('online', online);
    return () => { request.current?.abort(); request.current = null; clearTimeout(first); clearInterval(timer); window.removeEventListener('online', online); };
  }, [active, refresh]);
  return { data, error, loading, refresh };
}
