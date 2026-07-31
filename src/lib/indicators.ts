/**
 * Pure technical-analysis math. No I/O, no dependencies.
 *
 * Every function returns an array the same length as its input, padded with
 * `null` at the front where there isn't enough history yet. Keeping the arrays
 * aligned to the bar index means callers can always read `series[i]` for bar
 * `i` without juggling offsets.
 */

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Series = (number | null)[];

const nulls = (n: number): Series => new Array(n).fill(null);

/**
 * Collapse daily bars into weekly ones (ISO week, Monday-anchored). Open is the
 * week's first open, close its last, high/low the extremes, volume the sum.
 *
 * Deriving the weekly series from the dailies we already hold means the
 * higher-timeframe check costs no extra API call. The final week is partial
 * whenever the latest data lands mid-week — that's correct, not a bug: it's the
 * week-so-far, which is what a trader is actually looking at.
 */
export function resampleWeekly(bars: Bar[]): Bar[] {
  const weeks = new Map<string, Bar[]>();

  for (const b of bars) {
    const d = new Date(b.date);
    // Monday as week start: shift so Monday=0, then step back to it.
    const day = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day);
    const key = monday.toISOString().slice(0, 10);
    const list = weeks.get(key) ?? [];
    list.push(b);
    weeks.set(key, list);
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, group]) => ({
      date: key,
      open: group[0].open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: group.at(-1)!.close,
      volume: group.reduce((s, g) => s + g.volume, 0),
    }));
}

export function sma(values: number[], period: number): Series {
  const out = nulls(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out = nulls(values.length);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stdev(values: number[], period: number): Series {
  const out = nulls(values.length);
  for (let i = period - 1; i < values.length; i++) {
    const win = values.slice(i - period + 1, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** Wilder's RSI. <30 oversold, >70 overbought. */
export function rsi(values: number[], period = 14): Series {
  const out = nulls(values.length);
  if (values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface Macd {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i]! - emaSlow[i]! : null,
  );

  // The signal line is an EMA of the MACD line, which only exists from `slow-1`
  // onward — so compute it on the dense tail and map the result back.
  const firstIdx = macdLine.findIndex((v) => v !== null);
  const signal = nulls(values.length);
  const histogram = nulls(values.length);
  if (firstIdx !== -1) {
    const dense = macdLine.slice(firstIdx) as number[];
    const sig = ema(dense, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] === null) continue;
      signal[firstIdx + i] = sig[i];
      histogram[firstIdx + i] = dense[i] - sig[i]!;
    }
  }
  return { macd: macdLine, signal, histogram };
}

function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Wilder-smoothed Average True Range — the basis for stops and targets. */
export function atr(bars: Bar[], period = 14): Series {
  const out = nulls(bars.length);
  const tr = trueRange(bars);
  if (bars.length <= period) return out;

  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface Adx {
  adx: Series;
  plusDI: Series;
  minusDI: Series;
}

/**
 * Average Directional Index — measures trend *strength*, not direction.
 * >25 means a real trend is in play; <20 means chop, where swing setups fail.
 */
export function adx(bars: Bar[], period = 14): Adx {
  const n = bars.length;
  const result: Adx = { adx: nulls(n), plusDI: nulls(n), minusDI: nulls(n) };
  if (n < period * 2) return result;

  const tr = trueRange(bars);
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const wilder = (src: number[]) => {
    const sm = nulls(n);
    let acc = src.slice(1, period + 1).reduce((a, b) => a + b, 0);
    sm[period] = acc;
    for (let i = period + 1; i < n; i++) {
      acc = acc - acc / period + src[i];
      sm[i] = acc;
    }
    return sm;
  };

  const sTR = wilder(tr);
  const sPlus = wilder(plusDM);
  const sMinus = wilder(minusDM);

  const dx = nulls(n);
  for (let i = period; i < n; i++) {
    if (!sTR[i]) continue;
    const pdi = (100 * sPlus[i]!) / sTR[i]!;
    const mdi = (100 * sMinus[i]!) / sTR[i]!;
    result.plusDI[i] = pdi;
    result.minusDI[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom;
  }

  const dxStart = period;
  const firstAdxIdx = dxStart + period - 1;
  if (firstAdxIdx < n) {
    let acc = 0;
    for (let i = dxStart; i <= firstAdxIdx; i++) acc += dx[i] ?? 0;
    let prev = acc / period;
    result.adx[firstAdxIdx] = prev;
    for (let i = firstAdxIdx + 1; i < n; i++) {
      prev = (prev * (period - 1) + (dx[i] ?? 0)) / period;
      result.adx[i] = prev;
    }
  }
  return result;
}

export interface Bollinger {
  upper: Series;
  middle: Series;
  lower: Series;
  /** Where price sits in the band: 0 = lower, 1 = upper. */
  percentB: Series;
  /** Band width as a fraction of the middle band — low values precede breakouts. */
  bandwidth: Series;
}

export function bollinger(values: number[], period = 20, mult = 2): Bollinger {
  const middle = sma(values, period);
  const sd = stdev(values, period);
  const upper = nulls(values.length);
  const lower = nulls(values.length);
  const percentB = nulls(values.length);
  const bandwidth = nulls(values.length);

  for (let i = 0; i < values.length; i++) {
    if (middle[i] === null || sd[i] === null) continue;
    const u = middle[i]! + mult * sd[i]!;
    const l = middle[i]! - mult * sd[i]!;
    upper[i] = u;
    lower[i] = l;
    percentB[i] = u === l ? 0.5 : (values[i] - l) / (u - l);
    bandwidth[i] = middle[i]! === 0 ? 0 : (u - l) / middle[i]!;
  }
  return { upper, middle, lower, percentB, bandwidth };
}

/** On-Balance Volume — cumulative volume signed by the day's direction. */
export function obv(bars: Bar[]): number[] {
  const out = [0];
  for (let i = 1; i < bars.length; i++) {
    const dir = Math.sign(bars[i].close - bars[i - 1].close);
    out.push(out[i - 1] + dir * bars[i].volume);
  }
  return out;
}

/** Percent rate of change over `period` bars. */
export function roc(values: number[], period: number): Series {
  const out = nulls(values.length);
  for (let i = period; i < values.length; i++) {
    const base = values[i - period];
    if (base !== 0) out[i] = ((values[i] - base) / base) * 100;
  }
  return out;
}

export interface Pivots {
  resistance: number[];
  support: number[];
}

/**
 * Swing highs/lows via fractal pivots: a bar whose high (low) exceeds every bar
 * within `lookback` on both sides. These are the levels swing traders actually
 * watch, as opposed to round numbers.
 */
export function pivotLevels(bars: Bar[], lookback = 5, keep = 4): Pivots {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) highs.push(bars[i].high);
    if (isLow) lows.push(bars[i].low);
  }

  const last = bars.at(-1)!.close;
  // Nearest levels above/below current price are the ones that matter.
  const resistance = highs
    .filter((h) => h > last)
    .sort((a, b) => a - b)
    .slice(0, keep);
  const support = lows
    .filter((l) => l < last)
    .sort((a, b) => b - a)
    .slice(0, keep);

  return { resistance, support };
}

/** Highest high / lowest low over the trailing `period` bars, excluding today. */
export function donchian(bars: Bar[], period = 20) {
  if (bars.length < period + 1) return null;
  const win = bars.slice(-period - 1, -1);
  return {
    high: Math.max(...win.map((b) => b.high)),
    low: Math.min(...win.map((b) => b.low)),
  };
}

/** Last non-null value of a series. */
export function last(s: Series): number | null {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i];
  return null;
}

/** Value `n` bars back from the end. */
export function at(s: Series, n: number): number | null {
  const i = s.length - 1 - n;
  return i >= 0 ? s[i] : null;
}
