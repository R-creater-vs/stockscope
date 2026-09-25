'use client';

import { useCallback, useEffect, useState } from 'react';
import { describeAlert, useAlerts } from '@/lib/useAlerts';
import NotifyToggle from './NotifyToggle';

interface EventRow { id: number; symbol: string; title: string; body: string; created_at: number }

export default function AlertsTab({ onSelect, onDiscover }: { onSelect: (symbol: string) => void; onDiscover?: () => void }) {
  const { alerts, ready, busy, error, remove, reload } = useAlerts();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setEventsError(null);
    try {
      const res = await fetch('/api/alerts/events', { cache: 'no-store' });
      const data = (await res.json()) as { events?: EventRow[]; error?: string };
      if (!res.ok || data.error || !Array.isArray(data.events)) throw new Error('Could not load alert history.');
      setEvents(data.events);
    } catch {
      setEventsError('Alert history is unavailable. Previously loaded events are kept below.');
    } finally {
      setEventsReady(true);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadEvents(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  const checkNow = async () => {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch('/api/alerts/scan', { method: 'POST' });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'The scan could not be completed.');
      // This endpoint returns global scheduler counts, not this user's counts.
      setScanMsg('Server check completed. Any conditions recorded for you appear in recent alerts. Unavailable stocks may be skipped.');
      await Promise.all([loadEvents(), reload()]);
    } catch {
      setScanMsg('The server check could not be completed. Please retry when connected.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:grid-cols-[1fr_1fr]" aria-labelledby="notification-heading">
        <div><h2 id="notification-heading" className="text-base font-medium">Delivery settings</h2><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Rules are checked by the server while it is running. The default schedule is every 15 minutes; deployment settings may differ. Browser delivery needs permission and an active subscription.</p></div>
        <div className="lg:border-l lg:border-[var(--border)] lg:pl-6"><NotifyToggle /></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="rules-heading">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div><h2 id="rules-heading" className="text-lg font-medium">Saved rules <span className="tnum ml-2 text-sm text-[var(--muted)]">{ready ? alerts.length : '…'}</span></h2><p className="mt-1 text-xs text-[var(--muted)]">Conditions use the latest available daily price bars.</p></div>
          <button type="button" onClick={checkNow} disabled={scanning || !ready || alerts.length === 0} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm hover:bg-[var(--surface-2)] disabled:opacity-50">{scanning ? 'Checking conditions…' : 'Check conditions now'}</button>
        </header>
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3 text-sm text-[var(--bear)]"><p>{error}</p><button type="button" disabled={busy} onClick={() => void reload()} className="min-h-11 px-3 underline">Retry</button></div>}
        {scanMsg && <p role="status" className="border-b border-[var(--border)] px-5 py-4 text-sm text-[var(--muted)]">{scanMsg}</p>}
        {!ready ? <div role="status" aria-label="Loading alert rules" className="m-5 h-28 animate-pulse rounded-lg bg-[var(--surface-2)] motion-reduce:animate-none" />
          : alerts.length === 0 && !error ? <div className="px-5 py-10 sm:px-6"><h3 className="text-lg font-medium">Start with one condition worth watching.</h3><p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted)]">Open a stock report and add a rule for its score, daily move, 20-day high or swing stop. You will see the exact condition before saving.</p>{onDiscover && <button type="button" onClick={onDiscover} className="mt-5 min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--background)]">Find a stock to follow <span aria-hidden="true">↗</span></button>}</div>
          : <ul className="divide-y divide-[var(--border)]">{alerts.map((alert) => <li key={alert.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"><div className="min-w-0"><button type="button" onClick={() => onSelect(alert.symbol)} className="min-h-11 text-left text-sm font-semibold hover:text-[var(--accent)]">{alert.name} <span aria-hidden="true" className="ml-1 text-[var(--muted)]">↗</span></button><p className="text-sm text-[var(--muted)]">{describeAlert(alert)}</p><p className="mt-1 text-xs text-[var(--muted)]">{alert.last_fired ? `Last recorded ${new Date(alert.last_fired).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · 6-hour repeat limit` : 'Watching · no trigger recorded'}</p></div><button type="button" disabled={busy} onClick={() => void remove(alert.id)} aria-label={`Remove ${alert.name} alert: ${describeAlert(alert)}`} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--bear)] disabled:opacity-50">Remove</button></li>)}</ul>}
        <p className="border-t border-[var(--border)] px-5 py-4 text-xs leading-relaxed text-[var(--muted)] sm:px-6">A rule can trigger when its condition is already true; it does not require a new crossing. Repeat notifications are limited to one per rule every 6 hours. Delayed data and unavailable prices can delay or prevent a trigger.</p>
      </section>

      <section aria-labelledby="history-heading">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3"><h2 id="history-heading" className="text-lg font-medium">Recent alerts</h2><button type="button" onClick={() => void loadEvents()} className="min-h-11 rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface)]">Refresh history</button></header>
        {eventsError && <p role="alert" className="py-4 text-sm text-[var(--bear)]">{eventsError}</p>}
        {!eventsReady ? <p role="status" className="py-8 text-sm text-[var(--muted)]">Loading alert history…</p> : events.length === 0 && !eventsError ? <p className="py-8 text-sm text-[var(--muted)]">No conditions have been recorded yet. Triggered rules will appear here, even without browser notifications.</p> : <ul className="divide-y divide-[var(--border)]">{events.map((event) => <li key={event.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><button type="button" onClick={() => onSelect(event.symbol)} className="min-h-11 text-left text-sm font-semibold hover:text-[var(--accent)]">{event.title} <span aria-hidden="true">↗</span></button><time dateTime={new Date(event.created_at).toISOString()} className="text-xs text-[var(--muted)]">{new Date(event.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</time></div><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{event.body}</p></li>)}</ul>}
      </section>
    </div>
  );
}
