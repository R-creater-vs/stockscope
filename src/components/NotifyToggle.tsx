'use client';

import { usePush } from '@/lib/usePush';

/**
 * Enable/disable browser push notifications. Honest about the one hard
 * requirement — a supporting browser with permission granted — and offers a test
 * send so the user can confirm it works before relying on it.
 */
export default function NotifyToggle({ compact = false }: { compact?: boolean }) {
  const { supported, permission, subscribed, busy, enable, disable, test } = usePush();

  if (!supported) {
    return (
      <p className="text-xs text-[var(--muted)]">
        This browser doesn&apos;t support push notifications. Alerts will still be recorded in the
        log below.
      </p>
    );
  }

  if (permission === 'denied') {
    return (
      <p className="text-xs text-[var(--bear)]">
        Notifications are blocked in your browser settings. Re-enable them for this site to receive
        alerts.
      </p>
    );
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
      {subscribed ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-[var(--bull)]">
            <span className="h-2 w-2 rounded-full bg-[var(--bull)]" /> Notifications on
          </span>
          <button
            onClick={test}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            Send test
          </button>
          <button
            onClick={disable}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--bear)] hover:text-[var(--bear)] disabled:opacity-40"
          >
            Turn off
          </button>
        </>
      ) : (
        <button
          onClick={enable}
          disabled={busy}
          className="rounded-lg bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_6px_16px_-8px_var(--glow)] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
      )}
    </div>
  );
}
