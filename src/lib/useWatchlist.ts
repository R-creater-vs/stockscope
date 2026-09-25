'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export interface WatchItem {
  symbol: string;
  name: string;
  addedAt: number;
}

interface Snapshot {
  items: WatchItem[];
  ready: boolean;
  busy: boolean;
  error: string | null;
}

const INITIAL: Snapshot = { items: [], ready: false, busy: false, error: null };
let state = INITIAL;
let loadStarted = false;
const listeners = new Set<() => void>();

function update(next: Partial<Snapshot>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

interface ServerRow { symbol: string; name: string; added_at: number }

async function readList(res: Response) {
  const data = (await res.json()) as { items?: ServerRow[]; error?: string };
  if (!res.ok || data.error || !Array.isArray(data.items)) {
    throw new Error(data.error || 'Your watchlist could not be saved. Please try again.');
  }
  return data.items.map((row) => ({ symbol: row.symbol, name: row.name, addedAt: row.added_at }));
}

async function reload() {
  if (state.busy) return;
  loadStarted = true;
  update({ busy: true, error: null });
  try {
    const items = await readList(await fetch('/api/watchlist', { cache: 'no-store' }));
    update({ items, ready: true, busy: false });
  } catch {
    update({ ready: true, busy: false, error: 'Your saved watchlist could not be loaded. Check your connection and retry.' });
  }
}

async function change(symbol: string, name: string, add: boolean): Promise<string | null> {
  if (!state.ready || state.busy) return 'Please wait for your watchlist to finish syncing.';
  const previous = state.items;
  update({
    items: add ? [{ symbol, name, addedAt: Date.now() }, ...previous] : previous.filter((item) => item.symbol !== symbol),
    busy: true,
    error: null,
  });
  try {
    const res = add
      ? await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, name }) })
      : await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    const items = await readList(res);
    update({ items, busy: false });
    return null;
  } catch {
    const error = 'Watchlist change could not be confirmed. The previous list is shown; retry when connected.';
    update({ items: previous, busy: false, error });
    return error;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWatchlist() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => { if (!loadStarted) void reload(); }, []);

  const has = useCallback((symbol: string) => snapshot.items.some((item) => item.symbol === symbol.toUpperCase()), [snapshot.items]);
  const toggle = useCallback((symbol: string, name: string) => {
    const normalized = symbol.toUpperCase();
    return change(normalized, name, !state.items.some((item) => item.symbol === normalized));
  }, []);
  const remove = useCallback((symbol: string) => change(symbol.toUpperCase(), '', false), []);

  return { ...snapshot, has, toggle, remove, reload };
}
