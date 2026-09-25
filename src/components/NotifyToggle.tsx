'use client';

import { useState } from 'react';
import { usePush } from '@/lib/usePush';

export default function NotifyToggle({ compact = false }: { compact?: boolean }) {
  const { ready, supported, permission, subscribed, busy, error, enable, disable, test, refresh } = usePush();
  const [message, setMessage] = useState<string | null>(null);

  if (!ready) return <p role="status" className="text-sm text-[var(--muted)]">Checking notification status…</p>;
  if (!supported) return <p className="text-sm leading-relaxed text-[var(--muted)]">Browser push is unavailable here. Your saved rules can still record events in recent alerts.</p>;
  if (permission === 'denied') return <p className="text-sm leading-relaxed text-[var(--muted)]">Browser notifications are blocked. Your alert rules remain saved; recorded events are available in Alerts. Delivery can be enabled in this site&apos;s browser settings.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{subscribed ? 'Browser notifications on' : 'Browser notifications off'}</p>
      {!compact && <p className="text-xs leading-relaxed text-[var(--muted)]">Notifications are optional. Saved rules and event history work without them. Delivery also depends on your browser and device settings.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {subscribed ? <>
          <button type="button" disabled={busy} onClick={async () => { setMessage(null); const result = await test(); setMessage(result.error ?? (result.delivered > 0 ? 'Test sent to your registered subscription(s). Check your device to confirm receipt.' : 'No subscription accepted the test. Try turning browser notifications off and on again.')); }} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm hover:bg-[var(--surface-2)] disabled:opacity-50">{busy ? 'Working…' : 'Send a test'}</button>
          <button type="button" disabled={busy} onClick={async () => { setMessage(null); const result = await disable(); setMessage(result ?? 'Browser delivery is off. Your rules remain saved.'); }} className="min-h-11 rounded-lg px-4 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50">Turn off</button>
        </> : <button type="button" disabled={busy} onClick={async () => { setMessage(null); const result = await enable(); setMessage(result ?? 'Browser subscription saved. Send a test to confirm receipt.'); }} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50">{busy ? 'Enabling…' : 'Enable browser delivery'}</button>}
      </div>
      {(message || error) && <div role={error ? 'alert' : 'status'} className="text-xs leading-relaxed" style={{ color: error ? 'var(--bear)' : 'var(--muted)' }}><p>{message || error}</p>{error && <button type="button" disabled={busy} onClick={() => { setMessage(null); void refresh(); }} className="min-h-11 px-2 underline">Recheck status</button>}</div>}
    </div>
  );
}
