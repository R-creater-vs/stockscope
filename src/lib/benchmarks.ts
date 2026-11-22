/**
 * Daily history for comparison indices (Nifty 50 and sector indices).
 *
 * Every stock report compares against the same few indices, so their series
 * are cached in-process for 10 minutes and concurrent requests share a single
 * fetch. A caller that gives up (deadline or cancellation) leaves the shared
 * fetch running to warm the cache. Failures return an explicit unavailable
 * result; they never fail the stock report itself.
 */

import type { Bar } from './indicators';
import { fetchBars } from './providers';
import { withDeadline } from './providerRequest';

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; bars: Bar[] }>();
const inFlight = new Map<string, Promise<Bar[]>>();

export type BenchmarkResult =
  | { status: 'available'; bars: Bar[]; retrievedAt: string }
  | { status: 'unavailable'; reason: string };

function load(symbol: string): Promise<Bar[]> {
  const existing = inFlight.get(symbol);
  if (existing) return existing;
  const task = fetchBars(symbol, 2, { priority: 'interactive' })
    .then(({ bars }) => {
      if (bars.length >= 60) {
        if (cache.size >= 40) cache.delete(cache.keys().next().value!);
        cache.set(symbol, { at: Date.now(), bars });
      }
      return bars;
    })
    .finally(() => inFlight.delete(symbol));
  inFlight.set(symbol, task);
  return task;
}

export async function benchmarkBars(symbol: string, signal?: AbortSignal, timeoutMs = 6_000): Promise<BenchmarkResult> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { status: 'available', bars: hit.bars, retrievedAt: new Date(hit.at).toISOString() };
  }
  try {
    const bars = await withDeadline(() => load(symbol), timeoutMs, signal);
    if (bars.length < 60) return { status: 'unavailable', reason: `The provider returned only ${bars.length} daily bars for this index.` };
    return { status: 'available', bars, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (signal?.aborted) return { status: 'unavailable', reason: 'The request was cancelled.' };
    const timedOut = error instanceof Error && (error.name === 'ProviderTimeoutError' || error.name === 'TimeoutError');
    return { status: 'unavailable', reason: timedOut ? 'The index series did not arrive in time.' : 'The index series could not be retrieved.' };
  }
}

/** Starts (or joins) a fetch without waiting, so a later `benchmarkBars` call can reuse it. */
export function prefetchBenchmark(symbol: string): void {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  load(symbol).catch(() => {});
}
