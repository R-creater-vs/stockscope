/**
 * Backtesting — replaying the swing engine over history to measure whether its
 * scores and verdicts actually predicted anything.
 *
 * The cardinal rule of an honest backtest is NO LOOK-AHEAD. On decision day `t`
 * the engine is shown only `bars[0..t]` — exactly what a trader had at that
 * close. Entries then fill at the NEXT day's open (you cannot trade on a close
 * you are still using to decide), and round-trip costs are deducted. Anything
 * looser flatters the strategy into a lie.
 *
 * Two independent studies come out of one pass:
 *   1. Signal study — for every day, the score vs the actual forward return.
 *      This isolates predictive power from the trade model. If a higher score
 *      does not lead to a higher forward return, the score is noise, full stop.
 *   2. Trade study — a full simulation with entries, stop/target/time exits and
 *      costs, producing win rate, expectancy, profit factor and drawdown.
 */

import { atr, last, roc, sma } from './indicators';
import type { Bar } from './indicators';
import { analyzeSwing, type Verdict } from './swing';
import { analyzeMidTerm } from './midterm';

/**
 * A strategy reduces the point-in-time analysis to just what the simulator needs:
 * a score (for the signal study), a verdict (the entry gate), and stop/target
 * levels (the trade). Making this pluggable lets the same rigorous, no-look-ahead
 * machinery test any horizon's engine, not just the swing one.
 */
export interface Decision {
  score: number;
  verdict: Verdict;
  stop: number | null;
  target: number | null;
}
export type Strategy = (bars: Bar[]) => Decision;
export type Engine = 'short' | 'mid' | 'long';

export const swingStrategy: Strategy = (bars) => {
  const a = analyzeSwing(bars);
  return { score: a.score, verdict: a.verdict, stop: a.plan?.stopLoss ?? null, target: a.plan?.target1 ?? null };
};

export const midStrategy: Strategy = (bars) => {
  const tf = analyzeMidTerm(bars);
  return {
    score: tf.score,
    verdict: tf.verdict,
    stop: tf.tradePlan?.stopLoss ?? null,
    target: tf.tradePlan?.target1 ?? null,
  };
};

/**
 * A PRICE-ONLY proxy for the long-term thesis: above a rising 200-day SMA with
 * positive 6- and 12-month momentum. This is NOT the real long-term engine —
 * that one is fundamentals-driven, and Yahoo only exposes *today's* fundamentals,
 * so backtesting it would be look-ahead fraud. This proxy tests only the part of
 * the long thesis that can be reconstructed point-in-time: the trend component.
 */
export const longTrendStrategy: Strategy = (bars) => {
  const closes = bars.map((b) => b.close);
  const price = closes.at(-1)!;
  const s200 = last(sma(closes, 200));
  const s200Ago = sma(closes, 200).at(-63) ?? null;
  const r126 = last(roc(closes, 126));
  const r252 = closes.length > 252 ? last(roc(closes, 252)) : r126;
  const atr14 = last(atr(bars, 14));

  let score = 50;
  if (s200 !== null) {
    const above = price > s200;
    const rising = s200Ago !== null && s200 > s200Ago;
    const mom = ((r126 ?? 0) + (r252 ?? 0)) / 2;
    score = 50 + (above ? 18 : -22) + (rising ? 12 : -8) + Math.max(-15, Math.min(20, mom * 0.6));
    score = Math.max(0, Math.min(100, score));
  }
  const verdict: Verdict = score >= 72 ? 'STRONG_BUY' : score >= 58 ? 'BUY' : score >= 40 ? 'HOLD' : 'AVOID';
  // Wide, trend-following exits appropriate to a multi-month hold.
  const stop = atr14 !== null ? price - 3 * atr14 : null;
  const target = atr14 !== null ? price + 8 * atr14 : null;
  return { score, verdict, stop, target };
};

export const STRATEGIES: Record<Engine, Strategy> = {
  short: swingStrategy,
  mid: midStrategy,
  long: longTrendStrategy,
};

export interface BacktestConfig {
  /** Take entries at this verdict or better. */
  minVerdict: 'BUY' | 'STRONG_BUY';
  /** Hard time stop, in trading days, if neither stop nor target is hit. */
  holdMaxDays: number;
  /** Round-trip cost as a percent of notional (brokerage + STT + charges). */
  costPct: number;
  /** Forward horizon for the signal study, in trading days. */
  signalHorizon: number;
  /** Bars of warmup before the first decision, so every indicator is valid. */
  warmup: number;
}

export const DEFAULT_CONFIG: BacktestConfig = {
  minVerdict: 'BUY',
  holdMaxDays: 15,
  // ~0.2% round trip is realistic for NSE delivery (STT 0.1% sell + exchange,
  // GST, stamp, and slippage). Deliberately not zero — zero-cost backtests lie.
  costPct: 0.2,
  signalHorizon: 10,
  warmup: 210,
};

/**
 * Each horizon holds longer and is judged over a longer forward window. The
 * short config is the original; mid and long stretch the hold and the signal
 * horizon to match how those engines are meant to be traded.
 */
export const ENGINE_CONFIGS: Record<Engine, BacktestConfig> = {
  short: DEFAULT_CONFIG,
  mid: { minVerdict: 'BUY', holdMaxDays: 40, costPct: 0.2, signalHorizon: 20, warmup: 210 },
  long: { minVerdict: 'BUY', holdMaxDays: 90, costPct: 0.2, signalHorizon: 60, warmup: 210 },
};

const RANK: Record<'BUY' | 'STRONG_BUY', number> = { BUY: 2, STRONG_BUY: 3 };
const verdictRank: Record<Verdict, number> = { AVOID: 0, HOLD: 1, BUY: 2, STRONG_BUY: 3 };

export type ExitReason = 'target' | 'stop' | 'time';

export interface Trade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  stop: number;
  target: number;
  reason: ExitReason;
  /** Net return after costs, in percent. */
  returnPct: number;
  /** Net return expressed in units of the risk taken (the classic "R"). */
  r: number;
  holdDays: number;
  score: number;
  verdict: Verdict;
}

export interface TradeStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  medianReturnPct: number;
  avgR: number;
  /** Average net R per trade — the expected edge. Positive means an edge exists. */
  expectancyR: number;
  /** Gross profit / gross loss. >1 is profitable; >1.5 is healthy. */
  profitFactor: number;
  avgHoldDays: number;
  /** Worst peak-to-trough on a one-position-at-a-time equity curve, percent. */
  maxDrawdownPct: number;
  /** Compounded return trading this symbol one position at a time, percent. */
  totalReturnPct: number;
}

export interface SignalBucket {
  label: string;
  min: number;
  max: number;
  n: number;
  avgForwardReturnPct: number;
  winRate: number;
}

export interface SignalStudy {
  horizon: number;
  samples: number;
  buckets: SignalBucket[];
  /** Pearson correlation of score with forward return. >0 means signal. */
  correlation: number;
}

export interface SymbolBacktest {
  symbol: string;
  from: string;
  to: string;
  bars: number;
  config: BacktestConfig;
  trades: Trade[];
  stats: TradeStats;
  signal: SignalStudy;
  /** Buy-and-hold over the same window, for honest comparison. */
  buyHoldReturnPct: number;
  equityCurve: { date: string; equity: number }[];
  /**
   * The same run but taking longs only on market-uptrend days — populated only
   * when a `regime` map is supplied. Produced in the SAME engine pass as the
   * unfiltered trades, so the filter costs almost nothing extra.
   */
  filtered?: { trades: Trade[]; stats: TradeStats; equityCurve: { date: string; equity: number }[] };
}

/* -------------------------------------------------------------------------- */

/**
 * One pass over the history does everything. The engine is the expensive part —
 * recomputed at every decision day — so it runs exactly once per day and feeds
 * the signal samples, the unfiltered trades, and (when `regime` is given) the
 * regime-filtered trades all at once.
 *
 * `regime` maps a date to whether the broad market was in an uptrend that day
 * (Nifty above its 50-EMA). The filtered timeline takes longs only on risk-on
 * days — the standard "don't fight the index" rule — and is tracked in parallel
 * with its own non-overlapping position state.
 */
export interface BacktestWindow {
  from: string; // inclusive YYYY-MM-DD
  to: string; // inclusive YYYY-MM-DD
}

export function backtestSymbol(
  symbol: string,
  bars: Bar[],
  config: BacktestConfig = DEFAULT_CONFIG,
  regime?: Record<string, boolean>,
  strategy: Strategy = swingStrategy,
  window?: BacktestWindow,
): SymbolBacktest {
  const n = bars.length;
  const minRank = RANK[config.minVerdict];
  const horizon = config.signalHorizon;

  const trades: Trade[] = [];
  const tradesFiltered: Trade[] = [];
  const scores: number[] = [];
  const forwards: number[] = [];

  // Decisions are only counted inside the window; bars BEFORE it still feed
  // warmup and indicator computation. That is the whole point of the buffered
  // fetch — the engine is fully warmed by `window.from`, so the entire window is
  // tested, with no look-ahead and no wasted period lost to warmup.
  const inWindow = (date: string) => !window || (date >= window.from && date <= window.to);

  // Two independent, non-overlapping position timelines share the single engine
  // pass: the raw strategy and the regime-filtered one.
  let nextEntryIdx = config.warmup;
  let nextEntryFilteredIdx = config.warmup;

  for (let i = config.warmup; i < n - 1; i++) {
    const onDate = bars[i].date;
    if (!inWindow(onDate)) continue;

    const decision = strategy(bars.slice(0, i + 1));

    // Signal sample: this day's score vs the realised forward return.
    if (i < n - horizon) {
      scores.push(decision.score);
      forwards.push(((bars[i + horizon].close - bars[i].close) / bars[i].close) * 100);
    }

    if (decision.stop === null || decision.target === null || verdictRank[decision.verdict] < minRank)
      continue;

    const entryIdx = i + 1;
    const entry = bars[entryIdx].open;
    const stop = decision.stop;
    const target = decision.target;
    if (stop >= entry || target <= entry) continue;

    const regimeOn = !regime || regime[onDate] !== false;

    // Raw timeline.
    if (i >= nextEntryIdx) {
      const t = walkTrade(bars, entryIdx, stop, target, config, decision.score, decision.verdict);
      trades.push(t.trade);
      nextEntryIdx = Math.max(t.exitIdx, entryIdx);
    }
    // Regime-filtered timeline — only when the index is risk-on.
    if (regime && regimeOn && i >= nextEntryFilteredIdx) {
      const t = walkTrade(bars, entryIdx, stop, target, config, decision.score, decision.verdict);
      tradesFiltered.push(t.trade);
      nextEntryFilteredIdx = Math.max(t.exitIdx, entryIdx);
    }
  }

  const stats = summarise(trades);
  const signal = buildSignalStudy(scores, forwards, horizon);
  const equityCurve = buildEquityCurve(trades);

  // Buy-and-hold benchmark is measured over the tested window, not the buffer.
  const windowBars = window ? bars.filter((b) => inWindow(b.date)) : bars.slice(config.warmup);
  const first = windowBars[0] ?? bars[config.warmup] ?? bars[0];
  const lastBar = windowBars.at(-1) ?? bars.at(-1)!;

  return {
    symbol,
    from: first.date,
    to: lastBar.date,
    bars: n,
    config,
    trades,
    stats,
    signal,
    buyHoldReturnPct: ((lastBar.close - first.close) / first.close) * 100,
    equityCurve,
    filtered: regime
      ? {
          trades: tradesFiltered,
          stats: summarise(tradesFiltered),
          equityCurve: buildEquityCurve(tradesFiltered),
        }
      : undefined,
  };
}

/**
 * Walk a single open position forward to its exit. Enter at `entryIdx` open;
 * exit on stop, target, or the time limit — whichever comes first. A gap through
 * a level fills at the open, not the level, so slippage is never wished away.
 */
function walkTrade(
  bars: Bar[],
  entryIdx: number,
  stop: number,
  target: number,
  config: BacktestConfig,
  score: number,
  verdict: Verdict,
): { trade: Trade; exitIdx: number } {
  const n = bars.length;
  const entry = bars[entryIdx].open;
  const lastIdx = Math.min(entryIdx + config.holdMaxDays, n - 1);

  let exitIdx = lastIdx;
  let exitPrice = bars[lastIdx].close;
  let reason: ExitReason = 'time';

  for (let j = entryIdx; j <= lastIdx; j++) {
    const day = bars[j];
    if (day.open <= stop) {
      exitIdx = j; exitPrice = day.open; reason = 'stop'; break;
    }
    if (day.open >= target) {
      exitIdx = j; exitPrice = day.open; reason = 'target'; break;
    }
    // Both levels touched intraday: assume the stop first. The pessimistic
    // default never overstates the edge.
    if (day.low <= stop) {
      exitIdx = j; exitPrice = stop; reason = 'stop'; break;
    }
    if (day.high >= target) {
      exitIdx = j; exitPrice = target; reason = 'target'; break;
    }
  }

  const returnPct = ((exitPrice - entry) / entry) * 100 - config.costPct;
  const riskPct = ((entry - stop) / entry) * 100;

  return {
    exitIdx,
    trade: {
      entryDate: bars[entryIdx].date,
      exitDate: bars[exitIdx].date,
      entryPrice: entry,
      exitPrice,
      stop,
      target,
      reason,
      returnPct,
      r: riskPct > 0 ? returnPct / riskPct : 0,
      holdDays: exitIdx - entryIdx,
      score,
      verdict,
    },
  };
}

function summarise(trades: Trade[]): TradeStats {
  if (trades.length === 0) {
    return {
      trades: 0, wins: 0, losses: 0, winRate: 0, avgReturnPct: 0, medianReturnPct: 0,
      avgR: 0, expectancyR: 0, profitFactor: 0, avgHoldDays: 0, maxDrawdownPct: 0,
      totalReturnPct: 0,
    };
  }

  const rets = trades.map((t) => t.returnPct);
  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));

  const sorted = [...rets].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const t of trades) {
    equity *= 1 + t.returnPct / 100;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - equity) / peak);
  }

  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / trades.length) * 100,
    avgReturnPct: mean(rets),
    medianReturnPct: median,
    avgR: mean(trades.map((t) => t.r)),
    expectancyR: mean(trades.map((t) => t.r)),
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
    avgHoldDays: mean(trades.map((t) => t.holdDays)),
    maxDrawdownPct: maxDD * 100,
    totalReturnPct: (equity - 1) * 100,
  };
}

function buildEquityCurve(trades: Trade[]): { date: string; equity: number }[] {
  const curve = [{ date: trades[0]?.entryDate ?? '', equity: 100 }];
  let equity = 100;
  for (const t of trades) {
    equity *= 1 + t.returnPct / 100;
    curve.push({ date: t.exitDate, equity });
  }
  return curve;
}

/**
 * Bucket the (score, forward-return) samples. A monotone rise in forward return
 * across buckets is the engine earning its keep; a flat profile means the score
 * is decoration. This is the single most important output of the whole file.
 */
function buildSignalStudy(scores: number[], forwards: number[], horizon: number): SignalStudy {
  const ranges: [string, number, number][] = [
    ['<40', 0, 40],
    ['40-50', 40, 50],
    ['50-58', 50, 58],
    ['58-72 (Buy)', 58, 72],
    ['72+ (Strong)', 72, 101],
  ];

  const buckets: SignalBucket[] = ranges.map(([label, min, max]) => {
    const rs: number[] = [];
    for (let k = 0; k < scores.length; k++) {
      if (scores[k] >= min && scores[k] < max) rs.push(forwards[k]);
    }
    return {
      label,
      min,
      max,
      n: rs.length,
      avgForwardReturnPct: rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : 0,
      winRate: rs.length ? (rs.filter((x) => x > 0).length / rs.length) * 100 : 0,
    };
  });

  return { horizon, samples: scores.length, buckets, correlation: pearson(scores, forwards) };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  return denom === 0 ? 0 : cov / denom;
}

/* --------------------------------------------------------- aggregate study */

export interface AggregateStudy {
  symbolsTested: number;
  config: BacktestConfig;
  /**
   * Per-trade metrics pool cleanly across symbols; drawdown and total-return do
   * NOT (concatenating 84 symbols' trades into one equity curve is meaningless),
   * so those two fields are omitted here and reported per-symbol instead.
   */
  trade: Omit<TradeStats, 'maxDrawdownPct' | 'totalReturnPct'> & {
    avgBuyHoldPct: number;
    avgSymbolMaxDrawdownPct: number;
    avgSymbolTotalReturnPct: number;
  };
  byVerdict: Record<'BUY' | 'STRONG_BUY', Omit<TradeStats, 'maxDrawdownPct' | 'totalReturnPct'>>;
  signal: SignalStudy;
  /** Correlation averaged across symbols — a per-symbol view of predictive power. */
  avgSymbolCorrelation: number;
}

/**
 * Pool many single-symbol backtests into one verdict on the engine. Per-trade
 * metrics pool cleanly; the score buckets are recomputed over all samples so the
 * monotonicity test has the full population behind it.
 */
export function aggregate(results: SymbolBacktest[]): AggregateStudy {
  const allTrades = results.flatMap((r) => r.trades);
  const trade = summarise(allTrades);

  const byVerdict = {
    BUY: summarise(allTrades.filter((t) => t.verdict === 'BUY')),
    STRONG_BUY: summarise(allTrades.filter((t) => t.verdict === 'STRONG_BUY')),
  };

  // Recombine signal buckets across every symbol by weighting each bucket's mean
  // by its sample count.
  const horizon = results[0]?.signal.horizon ?? DEFAULT_CONFIG.signalHorizon;
  const bucketLabels = results[0]?.signal.buckets.map((b) => b.label) ?? [];
  const buckets: SignalBucket[] = bucketLabels.map((label, k) => {
    const src = results.map((r) => r.signal.buckets[k]).filter(Boolean);
    const n = src.reduce((s, b) => s + b.n, 0);
    const weightedRet = src.reduce((s, b) => s + b.avgForwardReturnPct * b.n, 0);
    const weightedWin = src.reduce((s, b) => s + b.winRate * b.n, 0);
    return {
      label,
      min: src[0]?.min ?? 0,
      max: src[0]?.max ?? 0,
      n,
      avgForwardReturnPct: n ? weightedRet / n : 0,
      winRate: n ? weightedWin / n : 0,
    };
  });

  const totalSamples = results.reduce((s, r) => s + r.signal.samples, 0);
  const nz = results.length || 1;
  const avg = (sel: (r: SymbolBacktest) => number) =>
    results.length === 0 ? 0 : results.reduce((s, r) => s + sel(r), 0) / nz;

  // Drawdown/total-return are meaningless pooled, so drop them from the pooled
  // block and carry per-symbol averages instead.
  const stripDDTR = (s: TradeStats): Omit<TradeStats, 'maxDrawdownPct' | 'totalReturnPct'> => {
    const rest = { ...s } as Partial<TradeStats>;
    delete rest.maxDrawdownPct;
    delete rest.totalReturnPct;
    return rest as Omit<TradeStats, 'maxDrawdownPct' | 'totalReturnPct'>;
  };

  return {
    symbolsTested: results.length,
    config: results[0]?.config ?? DEFAULT_CONFIG,
    trade: {
      ...stripDDTR(trade),
      avgBuyHoldPct: avg((r) => r.buyHoldReturnPct),
      avgSymbolMaxDrawdownPct: avg((r) => r.stats.maxDrawdownPct),
      avgSymbolTotalReturnPct: avg((r) => r.stats.totalReturnPct),
    },
    byVerdict: {
      BUY: stripDDTR(byVerdict.BUY),
      STRONG_BUY: stripDDTR(byVerdict.STRONG_BUY),
    },
    signal: { horizon, samples: totalSamples, buckets, correlation: pooledCorrelation(results) },
    avgSymbolCorrelation: avg((r) => r.signal.correlation),
  };
}

function pooledCorrelation(results: SymbolBacktest[]): number {
  // A sample-weighted average of per-symbol correlations — a robust pooled read
  // without re-holding every raw sample in memory.
  let wsum = 0;
  let w = 0;
  for (const r of results) {
    wsum += r.signal.correlation * r.signal.samples;
    w += r.signal.samples;
  }
  return w === 0 ? 0 : wsum / w;
}
