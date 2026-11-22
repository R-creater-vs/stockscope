/**
 * Data-quality rules for provider daily bars. Pure: no I/O.
 */

import type { Bar } from './indicators';

type Ohlcv = Pick<Bar, 'open' | 'high' | 'low' | 'close' | 'volume'>;

/**
 * A bar that records no trading: open, high, low and close all equal and zero
 * volume. Yahoo returns these for sessions it has no data for, repeating the
 * previous close; the 22 Nov 2026 engine study found them for 163 of 165
 * stocks on 2025-03-18, a normal NSE trading day, and for 158 on 2026-01-15
 * (docs/research/mid-engine-study.md). They also appear before the open, when
 * today's bar exists but nothing has traded.
 *
 * Read as a real session, such a bar has no range, which drags ATR and ADX
 * down, and it moves that day's price change into the next bar. A bar that
 * traded at a single price has volume, and a zero-volume bar with a range is
 * left alone, so neither is affected.
 */
export function isPlaceholderBar(bar: Ohlcv): boolean {
  return bar.volume === 0 && bar.open === bar.high && bar.high === bar.low && bar.low === bar.close;
}

/** The bars that record trading, in their original order. */
export function dropPlaceholderBars<T extends Ohlcv>(bars: T[]): T[] {
  return bars.filter((bar) => !isPlaceholderBar(bar));
}
