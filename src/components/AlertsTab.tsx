'use client';

import { useCallback, useEffect, useState } from 'react';
import { ALERT_LABELS, useAlerts } from '@/lib/useAlerts';
import NotifyToggle from './NotifyToggle';

interface EventRow {
  id: number;
  symbol: string;
  title: string;
  body: string;
  created_at: number;
}

export default function AlertsTab({ onSelect }: { onSelect: (symbol: string) => void }) {
  const { alerts, ready, remove } = useAlerts();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/events');
      const data = (await res.json()) as { events: EventRow[] };
      setEvents(data.events ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load on mount
    loadEvents();
  }, [loadEvents]);

  const checkNow = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch('/api/alerts/scan', { method: 'POST' });
      const data = (await res.json()) as { fired?: number; symbolsScanned?: number; error?: string };
      setScanMsg(
        data.error
          ? data.error
          : `Checked ${data.symbolsScanned ?? 0} stock${data.symbolsScanned === 1 ? '' : 's'} — ${data.fired ?? 0} alert${data.fired === 1 ? '' : 's'} fired.`,
      );
      await loadEvents();
    } catch {
      setScanMsg('Check failed.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Notifications</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Alerts are checked on the server every 15 minutes and delivered to this browser — even
          when StockScope isn&apos;t open.
        </p>
        <div className="mt-3">
          <NotifyToggle />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider">Your alerts</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {ready ? `${alerts.length} active` : 'Loading…'}
            </p>
          </div>
          <button
            onClick={checkNow}
            disabled={scanning || alerts.length === 0}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            {scanning ? 'Checking…' : 'Check now'}
          </button>
        </header>

        {scanMsg && <p className="border-b border-[var(--border)] px-5 py-2 text-xs text-[var(--muted)]">{scanMsg}</p>}

        {ready && alerts.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-[var(--muted)]">
            No alerts yet. Open any stock and use the &ldquo;Price alerts&rdquo; section to add one.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <button
                    onClick={() => onSelect(a.symbol)}
                    className="text-sm font-medium hover:text-[var(--accent)]"
                  >
                    {a.name}
                  </button>
                  <p className="text-xs text-[var(--muted)]">
                    {ALERT_LABELS[a.kind]}
                    {a.threshold !== null && ` ${a.threshold}${a.kind === 'move_pct' ? '%' : ''}`}
                    {a.timeframe === 'mid' && ' · mid-term'}
                  </p>
                </div>
                <button
                  onClick={() => remove(a.id)}
                  className="shrink-0 text-xs text-[var(--muted)] transition hover:text-[var(--bear)]"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Recent alerts</h2>
        </header>
        {events.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-[var(--muted)]">
            Nothing has triggered yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <button
                    onClick={() => onSelect(e.symbol)}
                    className="text-sm font-medium hover:text-[var(--accent)]"
                  >
                    {e.title}
                  </button>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {new Date(e.created_at).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
