/**
 * Synthetic OHLCV builders for rule tests. These bars are test fixtures with
 * hand-checked shapes, never product data.
 */

/** ISO date `offset` calendar days after 2026-01-01. */
export function dateAt(offset) {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

export function bar(date, open, high, low, close, volume = 1000) {
  return { date, open, high, low, close, volume };
}

/**
 * `count` falling bars: each closes 2 lower than the last, with a falling body
 * of 1 and shadows of 1 (body 33% of a range of 3). None of these bars forms a
 * named candle pattern on its own or with its neighbours.
 */
export function decline(count, start = 200, from = 0) {
  return Array.from({ length: count }, (_, i) => {
    const close = start - 2 * i;
    return bar(dateAt(from + i), close + 1, close + 2, close - 1, close);
  });
}

/** Mirror of `decline`: rising bars with a rising body of 1. */
export function advance(count, start = 100, from = 0) {
  return Array.from({ length: count }, (_, i) => {
    const close = start + 2 * i;
    return bar(dateAt(from + i), close - 1, close + 1, close - 2, close);
  });
}

/** Flat bars with no prior trend under the 10-bar / 20-bar-average rule. */
export function flat(count, level = 150, from = 0) {
  return Array.from({ length: count }, (_, i) => bar(dateAt(from + i), level + 0.5, level + 1, level - 1, level));
}

/** Append a bar dated the day after the last one. */
export function next(bars, open, high, low, close, volume = 1000) {
  const offset = Math.round((Date.parse(bars.at(-1).date) - Date.parse(dateAt(0))) / 86_400_000) + 1;
  return [...bars, bar(dateAt(offset), open, high, low, close, volume)];
}

/**
 * Bars whose closes follow `closes`: open equals close and the high/low sit 0.5
 * either side, so each bar's high moves exactly with its close and swing pivots
 * fall where the closes peak or trough.
 */
export function fromCloses(closes, volume = 1000) {
  return closes.map((close, i) => bar(dateAt(i), close, close + 0.5, close - 0.5, close, volume));
}

export const byName = (scan, name) => scan.patterns.filter((p) => p.name === name);
