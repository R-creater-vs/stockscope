/**
 * Runs the single-stock backtest since the stock's LISTING, not a trailing
 * window — genuinely replaying its entire history. For an old, liquid name
 * (RELIANCE has traded since 1996) that is tens of thousands of decision days,
 * each re-running the full engine: measured at ~80s on a desktop for RELIANCE
 * alone, and this app also has to run acceptably on a phone. A single HTTP
 * request cannot responsibly block on that.
 *
 * So this is a background job, not a request-response computation: the route
 * kicks it off (or joins one already running) and returns immediately with a
 * status; the client polls. A completed result is cached both in memory and on
 * disk — disk so a restart (the free on-phone hosting route loses its process
 * periodically) doesn't force paying the cost again for a stock already done
 * today. Same shape as the screener's persisted-cache fix, for the same reason.
 */

import type { SymbolMatch } from './providers';
import { fetchBars } from './providers';
import { backtestSymbolAsync, DEFAULT_CONFIG, type SymbolBacktest } from './backtest';
import { loadBacktestCache, saveBacktestCache } from './db';

// Daily bars change once a trading day — no value in ever recomputing more
// often than that, and it keeps a heavy job from ever running twice in a day
// for the same stock.
const FRESH_MS = 20 * 60 * 60 * 1000;

export interface BacktestPayload {
  match: SymbolMatch;
  result: SymbolBacktest;
  generatedAt: string;
}

export type BacktestStatus =
  | { status: 'ready'; payload: BacktestPayload }
  | { status: 'pending'; startedAt: number }
  | { status: 'error'; error: string };

interface JobState {
  status: 'running' | 'done' | 'error';
  startedAt: number;
  payload?: BacktestPayload;
  error?: string;
}

const jobs = new Map<string, JobState>();

/**
 * Returns the cached result if we have a fresh one (memory, or disk primed on
 * first ask for this symbol in this process), starts a background job if we
 * don't, and always returns immediately — never awaits the computation itself.
 */
export function getOrStartBacktest(symbol: string, match: SymbolMatch, retryFailed = false): BacktestStatus {
  const job = jobs.get(symbol);
  if (job?.status === 'done' && job.payload) return { status: 'ready', payload: job.payload };
  if (job?.status === 'running') return { status: 'pending', startedAt: job.startedAt };
  if (job?.status === 'error') {
    // Polling must surface a failed job rather than silently restart it forever.
    // Only an explicit Retry action starts another attempt.
    if (!retryFailed) return { status: 'error', error: job.error ?? 'The history check failed. Please retry.' };
    jobs.delete(symbol);
  }

  const persisted = loadBacktestCache(symbol);
  if (persisted && Date.now() - new Date(persisted.generatedAt).getTime() < FRESH_MS) {
    try {
      const payload = JSON.parse(persisted.data) as BacktestPayload;
      jobs.set(symbol, { status: 'done', startedAt: Date.now(), payload });
      return { status: 'ready', payload };
    } catch {
      /* corrupt cache row — fall through and recompute */
    }
  }

  const startedAt = Date.now();
  jobs.set(symbol, { status: 'running', startedAt });
  runJob(symbol, match);
  return { status: 'pending', startedAt };
}

async function runJob(symbol: string, match: SymbolMatch): Promise<void> {
  try {
    // Yahoo simply returns whatever it has from this date forward, so this is
    // "since the stock was listed" without needing to know that date up front.
    const { bars, symbol: resolved } = await fetchBars(symbol, { from: '1990-01-01' });
    if (bars.length < DEFAULT_CONFIG.warmup + 30) {
      jobs.set(symbol, {
        status: 'error',
        startedAt: Date.now(),
        error: `Only ${bars.length} days of history for ${resolved} — too few to backtest (need ~${DEFAULT_CONFIG.warmup + 30}).`,
      });
      return;
    }

    const result = await backtestSymbolAsync(resolved, bars);
    const payload: BacktestPayload = {
      match: { ...match, symbol: resolved },
      result,
      generatedAt: new Date().toISOString(),
    };
    jobs.set(symbol, { status: 'done', startedAt: Date.now(), payload });
    try {
      saveBacktestCache(resolved, JSON.stringify(payload), payload.generatedAt);
    } catch (err) {
      console.error('[backtest] failed to persist cache', err);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    jobs.set(symbol, { status: 'error', startedAt: Date.now(), error: `Backtest failed: ${message}` });
  }
}
