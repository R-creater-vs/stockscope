'use client';

import { useEffect, useRef, useState } from 'react';
import { SIGN_IN_HREF, signOut, useAuth } from '@/lib/useAuth';

/** Google's multicolour "G" mark, inline so it needs no network request. */
function GoogleG({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export default function AccountMenu() {
  const { user, googleConfigured, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Reserve the space before the session resolves so the header doesn't jump.
  if (!ready) return <div className="h-9 w-9 rounded-full bg-[var(--surface-2)] animate-pulse" />;

  return (
    <div ref={ref} className="relative">
      {user ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-2.5 transition hover:border-[var(--accent)]"
          aria-label="Account menu"
        >
          <Avatar user={user} />
          <span className="hidden max-w-[9rem] truncate text-sm font-medium sm:block">
            {user.name.split(' ')[0]}
          </span>
          <svg className="h-3.5 w-3.5 text-[var(--muted)]" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="btn-glass text-sm"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--muted)]" />
          Sign in
        </button>
      )}

      {open && (
        <div className="glass-panel absolute right-0 z-50 mt-2 w-72 origin-top-right animate-scale-in overflow-hidden">
          {user ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
                <Avatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                </div>
              </div>
              <div className="p-1.5">
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                    <path
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 4v-.5A1.5 1.5 0 0011.5 2h-6A1.5 1.5 0 004 3.5v13A1.5 1.5 0 005.5 18h6a1.5 1.5 0 001.5-1.5V16m3-6H8m8 0l-2.5-2.5M16 10l-2.5 2.5"
                    />
                  </svg>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="p-4">
              <p className="text-sm font-semibold">Sign in to StockScope</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Sync your watchlist and price alerts across every device you use.
              </p>

              {googleConfigured ? (
                <>
                  <a href={SIGN_IN_HREF} className="btn-google mt-3.5 w-full">
                    <GoogleG />
                    Continue with Google
                  </a>
                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                    Your device&apos;s current watchlist &amp; alerts move to your account
                    automatically.
                  </p>
                </>
              ) : (
                <div className="mt-3.5 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
                  <p className="font-medium text-[var(--foreground)]">Google sign-in isn&apos;t set up yet</p>
                  <p className="mt-1">
                    Create an OAuth client at{' '}
                    <span className="text-[var(--accent)]">console.cloud.google.com</span>, then add{' '}
                    <code className="rounded bg-[var(--surface-2)] px-1">GOOGLE_CLIENT_ID</code> and{' '}
                    <code className="rounded bg-[var(--surface-2)] px-1">GOOGLE_CLIENT_SECRET</code> to
                    your <code className="rounded bg-[var(--surface-2)] px-1">.env.local</code>. Full
                    steps are in the README.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ user, size = 'sm' }: { user: { name: string; picture: string }; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-xs';
  if (user.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar from Google's CDN, not a bundled asset
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${dim} grid shrink-0 place-items-center rounded-full font-bold text-white`}
      style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
    >
      {initials(user.name)}
    </span>
  );
}
