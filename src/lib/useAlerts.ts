'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type AlertKind = 'score_above' | 'score_below' | 'breakout' | 'hits_stop' | 'move_pct';

export interface Alert {
  id: string;
  symbol: string;
  name: string;
  kind: AlertKind;
  threshold: number | null;
  timeframe: string;
  last_fired: number | null;
  created_at: number;
}

export interface NewAlert {
  symbol: string;
  name: string;
  kind: AlertKind;
  threshold?: number | null;
  timeframe?: 'short' | 'mid';
}

const EMPTY: Alert[] = [];
let alerts: Alert[] = EMPTY;
let ready = false;
let loadStarted = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

async function load() {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const res = await fetch('/api/alerts');
    const data = (await res.json()) as { alerts: Alert[] };
    alerts = data.alerts ?? [];
  } catch {
    alerts = EMPTY;
  } finally {
    ready = true;
    emit();
  }
}

async function reload() {
  try {
    const res = await fetch('/api/alerts');
    const data = (await res.json()) as { alerts: Alert[] };
    alerts = data.alerts ?? [];
    emit();
  } catch {
    /* keep current */
  }
}

export function useAlerts() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => alerts,
    () => EMPTY,
  );

  useEffect(() => {
    load();
  }, []);

  const add = useCallback(async (a: NewAlert) => {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a),
    });
    const data = (await res.json()) as { alerts?: Alert[]; error?: string };
    if (data.alerts) {
      alerts = data.alerts;
      emit();
    }
    return data.error ?? null;
  }, []);

  const remove = useCallback(async (id: string) => {
    alerts = alerts.filter((x) => x.id !== id); // optimistic
    emit();
    try {
      const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = (await res.json()) as { alerts: Alert[] };
      alerts = data.alerts ?? alerts;
      emit();
    } catch {
      reload();
    }
  }, []);

  const forSymbol = useCallback((symbol: string) => list.filter((a) => a.symbol === symbol), [list]);

  return { alerts: list, ready, add, remove, forSymbol, reload };
}

export const ALERT_LABELS: Record<AlertKind, string> = {
  score_above: 'Score rises above',
  score_below: 'Score falls below',
  breakout: '20-day breakout',
  hits_stop: 'Breaks swing stop',
  move_pct: 'Moves more than',
};
