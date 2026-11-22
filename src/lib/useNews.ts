'use client';

import { useEffect, useState } from 'react';
import type { NewsItem, NewsResult } from './news';

export interface NewsState {
  /** The last successfully retrieved result, kept visible if a refresh fails. */
  result: NewsResult | null;
  loading: boolean;
  /** True when the latest request failed. With a result present, that result is stale. */
  failed: boolean;
  retry: () => void;
}

/** Accepts older `{ items }` responses as well as the grouped shape. */
function normaliseResult(data: Partial<NewsResult> & { items: NewsItem[] }): NewsResult {
  const items = data.items.map((item) => ({ ...item, match: item.match ?? 'name', alsoReportedBy: item.alsoReportedBy ?? [], sourceDomain: item.sourceDomain ?? null }));
  const recent = data.recent ?? items.filter((i) => i.ageHours !== null && i.ageHours <= 168);
  const older = data.older ?? items.filter((i) => i.ageHours !== null && i.ageHours > 168);
  const undated = data.undated ?? items.filter((i) => i.ageHours === null);
  return {
    items,
    recent,
    older,
    undated,
    status: items.length ? 'ok' : 'empty',
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    tier: data.tier ?? null,
    query: data.query ?? null,
    aliases: data.aliases ?? [],
    filteredOut: data.filteredOut ?? 0,
    duplicatesMerged: data.duplicatesMerged ?? 0,
  };
}

export function useCompanyNews(company: string, symbol: string | null, refreshKey = 0): NewsState {
  const [state, setState] = useState<{ result: NewsResult | null; loading: boolean; failed: boolean }>({ result: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, failed: false }));
      try {
        const params = new URLSearchParams({ company });
        if (symbol) params.set('symbol', symbol);
        // A refresh or retry forces a fresh pull and avoids a cached browser response.
        if (refreshKey > 0 || attempt > 0) {
          params.set('fresh', '1');
          params.set('t', `${refreshKey}-${attempt}`);
        }
        const res = await fetch(`/api/news?${params}`);
        const data = (await res.json()) as Partial<NewsResult> & { items?: NewsItem[] };
        if (cancelled) return;
        if (!res.ok || data.status === 'error' || !Array.isArray(data.items)) {
          setState((s) => ({ result: s.result, loading: false, failed: true }));
          return;
        }
        setState({ result: normaliseResult(data as Partial<NewsResult> & { items: NewsItem[] }), loading: false, failed: false });
      } catch {
        if (!cancelled) setState((s) => ({ result: s.result, loading: false, failed: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, symbol, refreshKey, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
