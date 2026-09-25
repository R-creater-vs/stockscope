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

interface Snapshot { alerts: Alert[]; ready: boolean; busy: boolean; error: string | null }
const INITIAL: Snapshot = { alerts: [], ready: false, busy: false, error: null };
let state = INITIAL;
let loadStarted = false;
const listeners = new Set<() => void>();

function update(next: Partial<Snapshot>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

async function readAlerts(res: Response) {
  const data = (await res.json()) as { alerts?: Alert[]; error?: string };
  if (!res.ok || data.error || !Array.isArray(data.alerts)) throw new Error(data.error || 'Alert changes could not be confirmed.');
  return data.alerts;
}

async function reload() {
  if (state.busy) return;
  loadStarted = true;
  update({ busy: true, error: null });
  try {
    const alerts = await readAlerts(await fetch('/api/alerts', { cache: 'no-store' }));
    update({ alerts, ready: true, busy: false });
  } catch {
    update({ ready: true, busy: false, error: 'Your alert rules could not be loaded. Please retry.' });
  }
}

async function mutate(url: string, init: RequestInit): Promise<string | null> {
  if (state.busy) return 'Please wait for the current alert change to finish.';
  update({ busy: true, error: null });
  try {
    const alerts = await readAlerts(await fetch(url, init));
    update({ alerts, busy: false });
    return null;
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : 'Alert changes could not be confirmed. Please retry.';
    update({ busy: false, error });
    return error;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAlerts() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => { if (!loadStarted) void reload(); }, []);

  const add = useCallback((alert: NewAlert) => mutate('/api/alerts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alert),
  }), []);
  const remove = useCallback((id: string) => mutate(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }), []);
  const forSymbol = useCallback((symbol: string) => snapshot.alerts.filter((alert) => alert.symbol === symbol.toUpperCase()), [snapshot.alerts]);
  return { ...snapshot, add, remove, forSymbol, reload };
}

export const ALERT_LABELS: Record<AlertKind, string> = {
  score_above: 'Score at or above',
  score_below: 'Score at or below',
  breakout: 'Close above prior 20-day high',
  hits_stop: 'Close below recalculated swing stop',
  move_pct: 'Daily move in either direction at least',
};

/** Display stored thresholds, never the current values in a creation form. */
export function describeAlert(alert: Pick<Alert, 'kind' | 'threshold' | 'timeframe'>): string {
  const threshold = alert.threshold === null ? '' : ` ${alert.threshold}${alert.kind === 'move_pct' ? '%' : ''}`;
  const timeframe = alert.kind.startsWith('score_') ? ` · ${alert.timeframe === 'mid' ? 'mid-term' : 'swing'}` : '';
  return `${ALERT_LABELS[alert.kind]}${threshold}${timeframe}`;
}
