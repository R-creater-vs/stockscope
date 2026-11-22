'use client';

import { useEffect, useState } from 'react';

/**
 * Catches anything that throws while the workspace renders, so a failure shows
 * a way forward instead of Next's bare "This page couldn't load".
 *
 * The common cause is a stale page: the report, charts and secondary tabs are
 * loaded on demand, so a page opened before the server was rebuilt (e.g. after
 * `git pull && npm run build:termux`) asks for chunk files that no longer exist.
 * One fresh load picks up the current build; the URL already carries the stock
 * or tab that was being opened, so the person lands where they were heading.
 */
const STALE_BUILD = /ChunkLoadError|Loading (CSS )?chunk \S+ failed|Failed to load chunk|dynamically imported module|Importing a module script failed/i;
const RELOAD_KEY = 'nivra:stale-build-reload';
const RELOAD_GUARD_MS = 30_000;

/** True if no automatic reload happened moments ago, so a persistent fault can't loop. */
function mayAutoReload(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY)) > RELOAD_GUARD_MS;
  } catch {
    return false; // No storage means no loop guard; let the person reload instead.
  }
}

export default function AppError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const stale = STALE_BUILD.test(`${error.name} ${error.message}`);
  const [autoReload] = useState(() => stale && mayAutoReload());

  useEffect(() => {
    console.error(error);
    if (!autoReload) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch {}
    window.location.reload();
  }, [error, autoReload]);

  if (autoReload) {
    return <main className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6" role="status"><span className="eyebrow">NIVRA</span><h1 className="mt-3 text-2xl font-semibold tracking-tight">Loading the latest version…</h1><p className="mt-3 text-sm text-[var(--muted)]">NIVRA was updated since this page opened. Reloading once to pick up the new version.</p></main>;
  }

  return <main className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
    <span className="eyebrow">NIVRA</span>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight">This view couldn&apos;t load</h1>
    <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{stale ? 'Part of the app could not be downloaded from the server. If the server was just rebuilt or restarted, reloading fetches the current version.' : 'Something went wrong while showing this screen. Your watchlist and alerts are not affected.'}</p>
    <p className="fine-print mt-4 break-words rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono">{error.name}: {error.message}{error.digest ? ` (digest ${error.digest})` : ''}</p>
    <div className="mt-6 flex flex-wrap gap-3">
      {stale ? <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button> : <button className="btn-primary" onClick={() => unstable_retry()}>Try again</button>}
      <button className="btn-glass" onClick={() => { window.location.href = '/'; }}>Go to overview</button>
    </div>
  </main>;
}
