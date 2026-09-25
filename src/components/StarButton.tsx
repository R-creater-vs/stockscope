'use client';

import { memo, useState } from 'react';
import { useWatchlist } from '@/lib/useWatchlist';

function StarButton({ symbol, name, size = 'md' }: { symbol: string; name: string; size?: 'sm' | 'md' }) {
  const { has, toggle, ready, busy } = useWatchlist();
  const [message, setMessage] = useState<string | null>(null);
  const active = ready && has(symbol);

  return (
    <span className="inline-flex shrink-0 items-center">
      <button
        type="button"
        aria-label={active ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
        aria-pressed={active}
        disabled={!ready || busy}
        onClick={async (event) => {
          event.stopPropagation();
          event.preventDefault();
          setMessage(null);
          setMessage(await toggle(symbol, name));
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-2)] disabled:cursor-wait disabled:opacity-50"
        style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
        title={active ? 'Saved to watchlist' : 'Save to watchlist'}
      >
        <svg aria-hidden="true" width={size === 'sm' ? 18 : 20} height={size === 'sm' ? 18 : 20} viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.3.9-4.55 4.44 1.07 6.27L12 17.35l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9L12 3Z" /></svg>
      </button>
      {message && <span role="alert" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-[var(--bear)] bg-[var(--surface)] p-4 text-left text-sm text-[var(--foreground)] shadow-lg"><span>{message}</span><button type="button" onClick={(event) => { event.stopPropagation(); setMessage(null); }} aria-label="Dismiss watchlist error" className="h-11 w-11 shrink-0 rounded-lg">×</button></span>}
    </span>
  );
}

export default memo(StarButton);
