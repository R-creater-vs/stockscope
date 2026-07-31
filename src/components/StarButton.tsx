'use client';

import { memo } from 'react';
import { useWatchlist } from '@/lib/useWatchlist';

/**
 * The star is the whole watchlist affordance — one tap to save, one to remove.
 * `stopPropagation` matters: on a stock card the star sits inside a button, and
 * starring must not also open the report.
 */
function StarButton({
  symbol,
  name,
  size = 'md',
}: {
  symbol: string;
  name: string;
  size?: 'sm' | 'md';
}) {
  const { has, toggle, ready } = useWatchlist();
  const active = ready && has(symbol);
  const px = size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={active ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle(symbol, name);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          toggle(symbol, name);
        }
      }}
      className={`${px} shrink-0 cursor-pointer leading-none transition hover:scale-110`}
      style={{ color: active ? 'var(--warn)' : 'var(--muted)' }}
      title={active ? 'In your watchlist' : 'Add to watchlist'}
    >
      {active ? '★' : '☆'}
    </span>
  );
}

export default memo(StarButton);
