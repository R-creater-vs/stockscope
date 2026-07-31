'use client';

import { useEffect, useState } from 'react';
import type { NewsItem } from '@/lib/news';

function ago(hours: number | null): string {
  if (hours === null) return '';
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const d = Math.round(hours / 24);
  return `${d}d ago`;
}

export default function NewsPanel({
  company,
  refreshKey = 0,
}: {
  company: string;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setItems(null);
      setError(false);
      try {
        // A refresh (refreshKey > 0) forces a genuinely fresh pull and dodges any
        // browser caching of the identical URL via a changing cache-buster.
        const fresh = refreshKey > 0 ? `&fresh=1&t=${refreshKey}` : '';
        const res = await fetch(`/api/news?company=${encodeURIComponent(company)}${fresh}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.items?.length) setItems(data.items);
        else {
          setItems([]);
          if (data.error) setError(true);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, refreshKey]);

  if (items === null) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-[var(--muted)]">
        {error ? 'Could not load news right now.' : 'No recent news found for this stock.'}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((n) => (
          <li key={n.link}>
            <a
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-5 py-3 transition hover:bg-[var(--surface-2)]"
            >
              <p className="text-sm leading-snug">{n.title}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>{n.source}</span>
                {n.ageHours !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{ago(n.ageHours)}</span>
                  </>
                )}
                <span aria-hidden className="ml-auto opacity-60">
                  ↗
                </span>
              </p>
            </a>
          </li>
        ))}
      </ul>
      <p className="px-5 py-2.5 text-[11px] text-[var(--muted)]">
        Headlines via Google News. StockScope does not endorse any source — read them as leads to
        verify, not facts.
      </p>
    </>
  );
}
