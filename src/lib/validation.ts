/**
 * Measured backtest results for each engine — the app's own report card.
 *
 * These are not estimates or targets. They are the pooled output of
 * `/api/backtest-study` run over the liquid NSE universe with point-in-time
 * replay, next-open fills and 0.2% round-trip costs. They exist so the verdict
 * card can state honestly how much weight its own score deserves.
 *
 * Re-run the three studies and update these numbers whenever an engine changes.
 * A score shown without its track record is a claim without evidence.
 */

import type { Timeframe } from './timeframes';

/** A single measured window. */
export interface WindowResult {
  window: string; // e.g. "2023–2026"
  correlation: number;
  expectancyR: number;
  buyHoldPct: number;
}

export interface ValidationRecord {
  /**
   * Score vs forward-return correlation as the study computes it: the
   * sample-weighted average of each stock's own Pearson correlation
   * (`pooledCorrelation` in backtest.ts), not one correlation over all pooled
   * observations. >0 means higher scores preceded higher returns.
   */
  correlation: number;
  /** Net expectancy per trade, in units of risk. */
  expectancyR: number;
  profitFactor: number;
  samples: number;
  symbols: number;
  horizonDays: number;
  measuredOn: string;
  /** Average forward return of the lowest vs highest score bucket, percent. */
  lowBucketReturn: number;
  highBucketReturn: number;
  /** True for 'long': tested via a price-trend proxy, not the real fundamentals engine. */
  isProxy?: boolean;
  /**
   * A second, non-overlapping window. When present and its correlation disagrees
   * in sign with the primary window, the edge is regime-dependent, not stable —
   * the most important thing the study can tell a user.
   */
  inSample?: WindowResult;
  outOfSample?: WindowResult;
}

export const ENGINE_VALIDATION: Record<Timeframe, ValidationRecord> = {
  short: {
    correlation: -0.0717,
    expectancyR: -0.021,
    profitFactor: 0.8,
    samples: 67056,
    symbols: 128,
    horizonDays: 10,
    measuredOn: '2026-07-24',
    lowBucketReturn: 0.437,
    highBucketReturn: -0.09,
    // Tested across two non-overlapping 3-year windows. The sign of the edge
    // flipped between them — proof it is regime-dependent, not stable.
    inSample: { window: '2023–2026', correlation: -0.0717, expectancyR: -0.021, buyHoldPct: 12.2 },
    outOfSample: { window: '2019–2022', correlation: 0.0261, expectancyR: 0.059, buyHoldPct: 116.8 },
  },
  mid: {
    correlation: -0.1469,
    expectancyR: -0.034,
    profitFactor: 0.97,
    samples: 67832,
    symbols: 132,
    horizonDays: 20,
    measuredOn: '2026-07-24',
    lowBucketReturn: 0.754,
    highBucketReturn: -0.075,
  },
  long: {
    correlation: -0.3459,
    expectancyR: -0.005,
    profitFactor: 1.03,
    samples: 62552,
    symbols: 132,
    horizonDays: 60,
    measuredOn: '2026-07-24',
    lowBucketReturn: 2.891,
    highBucketReturn: -1.423,
    isProxy: true,
  },
};

export type ValidationStatus = 'validated' | 'no-edge' | 'inverted' | 'regime-dependent';

export function validationStatus(v: ValidationRecord): ValidationStatus {
  // Two windows whose edge disagrees in sign = no stable edge. This wins over
  // any single-window reading, because a signal that only works in one regime is
  // not a signal you can trade forward.
  if (v.inSample && v.outOfSample && Math.sign(v.inSample.correlation) !== Math.sign(v.outOfSample.correlation)) {
    return 'regime-dependent';
  }
  if (v.correlation > 0.05 && v.expectancyR > 0.03) return 'validated';
  if (v.correlation < -0.05) return 'inverted';
  return 'no-edge';
}

/** One honest sentence about how much this engine's score has been worth. */
export function validationNote(tf: Timeframe): { status: ValidationStatus; text: string } {
  const v = ENGINE_VALIDATION[tf];
  const status = validationStatus(v);
  // The default study fetches three years of bars and spends the first 210
  // sessions on indicator warm-up, so decisions cover about the latest two years.
  const scope = `${v.symbols} stocks, ${v.samples.toLocaleString('en-IN')} samples, about two years of decisions, net of costs`;

  if (status === 'regime-dependent' && v.inSample && v.outOfSample) {
    return {
      status,
      text: `Not a reliable signal — no stable edge. Backtested across two non-overlapping windows and the result flipped: mildly positive in the ${v.outOfSample.window} bull market (${v.outOfSample.expectancyR >= 0 ? '+' : ''}${v.outOfSample.expectancyR.toFixed(2)}R per trade) but inverted in the ${v.inSample.window} choppy market (${v.inSample.expectancyR.toFixed(2)}R). Which way the score works depends on the market regime — and buy-and-hold beat the active strategy in both (e.g. +${v.outOfSample.buyHoldPct.toFixed(0)}% over ${v.outOfSample.window}). Read the score as a description of the stock's state, not a buy signal.`,
    };
  }

  if (status === 'validated') {
    return {
      status,
      text: `Backtested: higher scores did lead to higher ${v.horizonDays}-day returns (correlation ${v.correlation.toFixed(2)}, ${v.expectancyR.toFixed(2)}R per trade) across ${scope}.`,
    };
  }

  if (status === 'inverted') {
    return {
      status,
      text: `Not validated — historically inverted (in-sample only; not yet tested out of sample). Over ${scope}, the lowest-scoring stocks returned ${v.lowBucketReturn.toFixed(2)}% on average over ${v.horizonDays} days while the highest-scoring returned ${v.highBucketReturn.toFixed(2)}% (correlation ${v.correlation.toFixed(2)}). Read this as a description of the stock's current state, not a buy signal.${
        v.isProxy ? ' Tested via a price-trend proxy; the fundamental inputs are not point-in-time testable.' : ''
      }`,
    };
  }

  return {
    status,
    text: `Not validated: no measurable edge over ${scope} (correlation ${v.correlation.toFixed(2)}, ${v.expectancyR.toFixed(2)}R per trade). Treat as analysis, not a buy signal.`,
  };
}
