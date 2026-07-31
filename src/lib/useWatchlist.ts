'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Server-backed watchlist. The list lives in the database keyed by the browser's
 * anonymous id (set by middleware), so it survives clearing localStorage, follows
 * the session across reloads, and — crucially — is visible to the background
 * scheduler that fires alerts. The client keeps a synced in-memory mirror so the
 * UI stays instant and optimistic.
 *
 * The public shape ({ items, ready, has, toggle, remove }) is unchanged from the
 * old localStorage hook, so call sites did not need touching.
 */

export interface WatchItem {
  symbol: string;
  name: string;
  addedAt: number;
}

const EMPTY: WatchItem[] = [];

let items: WatchItem[] = EMPTY;
let ready = false;
let loadStarted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setItems(next: WatchItem[]) {
  items = next;
  emit();
}

interface ServerRow {
  symbol: string;
  name: string;
  added_at: number;
}

function fromServer(rows: ServerRow[]): WatchItem[] {
  return rows.map((r) => ({ symbol: r.symbol, name: r.name, addedAt: r.added_at }));
}

async function load() {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const res = await fetch('/api/watchlist');
    const data = (await res.json()) as { items: ServerRow[] };
    items = fromServer(data.items ?? []);
  } catch {
    items = EMPTY;
  } finally {
    ready = true;
    emit();
  }
}

async function apiToggle(symbol: string, name: string, add: boolean) {
  try {
    const res = add
      ? await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, name }),
        })
      : await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    const data = (await res.json()) as { items: ServerRow[] };
    setItems(fromServer(data.items ?? []));
  } catch {
    // Network hiccup: re-sync from the server so the mirror never drifts.
    loadStarted = false;
    load();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getSnapshot = () => items;
const getServerSnapshot = () => EMPTY;

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    load();
  }, []);

  const has = useCallback((symbol: string) => list.some((i) => i.symbol === symbol), [list]);

  const toggle = useCallback(
    (symbol: string, name: string) => {
      const exists = items.some((i) => i.symbol === symbol);
      // Optimistic update, then reconcile with the server's authoritative list.
      setItems(
        exists
          ? items.filter((i) => i.symbol !== symbol)
          : [{ symbol, name, addedAt: Date.now() }, ...items],
      );
      apiToggle(symbol, name, !exists);
    },
    [],
  );

  const remove = useCallback((symbol: string) => {
    setItems(items.filter((i) => i.symbol !== symbol));
    apiToggle(symbol, '', false);
  }, []);

  return { items: list, ready, has, toggle, remove };
}
