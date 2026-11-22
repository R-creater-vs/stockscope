/**
 * Measured backtest results for each engine — the app's own report card.
 *
 * These are not estimates or targets. They are the app's own backtest (the
 * code behind `/api/backtest-study`: point-in-time replay over the liquid NSE
 * universe, next-open fills, 0.2% round-trip costs), run in two windows by
 * scripts/research/engine-study.mjs, which adds 95% intervals and a
 * shuffled-price baseline. They exist so the verdict card can state honestly
 * how much weight its own score deserves.
 *
 * Re-run the three studies and update these numbers whenever an engine changes,
 * under a new plan written before the run. A score shown without its track
 * record is a claim without evidence.
 */

import type { Timeframe } from './timeframes';

/** A single measured window. */
export interface WindowResult {
  window: string; // e.g. "2023–2026"
  correlation: number;
  expectancyR: number;
  buyHoldPct: number;
  /** First and last decision dates, when they were recorded. */
  from?: string;
  to?: string;
  samples?: number;
  trades?: number;
  /** 95% block-bootstrap interval for `correlation` (docs/research/mid-engine-study.md). */
  correlationCI?: [number, number];
  /** 95% interval for `expectancyR`, resampling calendar months of entry. */
  expectancyCI?: [number, number];
  /** Mean daily Spearman correlation between score and forward return across stocks. */
  meanDailyIC?: number;
  meanDailyICCI?: [number, number];
  /**
   * `correlation` measured the same way on each stock's days shuffled in time
   * (mean of three shuffles): what the metric reads when nothing is predictable.
   */
  nullCorrelation?: number;
  /** Each stock's trades compounded one position at a time, averaged across stocks, percent. */
  strategyReturnPct?: number;
  /**
   * True only if this window had never been run for this engine when its plan
   * was fixed, i.e. a genuine held-out test. A re-measured window is false.
   */
  heldOut?: boolean;
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
   * Two non-overlapping windows. With 95% intervals and a shuffled baseline,
   * `validationStatus` judges every window by its interval. Without them, a
   * sign disagreement between the windows is read as regime-dependent.
   */
  inSample?: WindowResult;
  outOfSample?: WindowResult;
  /** The study document behind this record, when there is one. */
  study?: string;
  /** An earlier measurement this record replaces, kept so the history stays visible. */
  previous?: { measuredOn: string; correlation: number; expectancyR: number; profitFactor: number; samples: number; symbols: number };
}

export const ENGINE_VALIDATION: Record<Timeframe, ValidationRecord> = {
  // Re-measured 2026-11-22 with the same methods as mid
  // (docs/research/short-long-remeasurement-plan.md). Both windows were examined
  // in July 2026 with the pooled correlation alone, so neither is held out. The
  // July record read its sign change between the two windows as a regime effect;
  // with intervals and the shuffled baseline that is not established
  // (docs/research/engine-studies.md). Top-level figures repeat the recent window.
  short: {
    correlation: -0.0734,
    expectancyR: -0.063,
    profitFactor: 0.78,
    samples: 85302,
    symbols: 165,
    horizonDays: 10,
    measuredOn: '2026-11-22',
    lowBucketReturn: 0.318,
    highBucketReturn: -0.084,
    inSample: {
      window: 'Oct 2024 – Nov 2026', from: '2024-10-01', to: '2026-11-05',
      correlation: -0.0734, correlationCI: [-0.1358, -0.0366],
      expectancyR: -0.063, expectancyCI: [-0.201, 0.0997],
      meanDailyIC: -0.0151, meanDailyICCI: [-0.0458, 0.0159],
      nullCorrelation: -0.0344,
      buyHoldPct: 1.1, strategyReturnPct: -19.9, samples: 85302, trades: 6247, heldOut: false,
    },
    outOfSample: {
      window: '2019–2022', from: '2019-01-01', to: '2022-12-16',
      correlation: 0.0122, correlationCI: [-0.0748, 0.0987],
      expectancyR: 0.04, expectancyCI: [-0.0398, 0.1179],
      meanDailyIC: -0.0171, meanDailyICCI: [-0.0441, 0.0103],
      nullCorrelation: -0.024,
      buyHoldPct: 121.4, strategyReturnPct: 18.45, samples: 154489, trades: 12770, heldOut: false,
    },
    study: 'docs/research/engine-studies.md',
    previous: { measuredOn: '2026-07-24', correlation: -0.0717, expectancyR: -0.021, profitFactor: 0.8, samples: 67056, symbols: 128 },
  },
  // Re-measured on 2026-11-22 under a pre-registered plan, with a held-out
  // 2019–2022 window, 95% intervals and a shuffled-price baseline. Produced by
  // scripts/research/engine-study.mjs --engine mid; see docs/research/mid-engine-study.md.
  // The top-level figures repeat the recent (primary) window.
  mid: {
    correlation: -0.1993,
    expectancyR: -0.136,
    profitFactor: 0.79,
    samples: 83652,
    symbols: 165,
    horizonDays: 20,
    measuredOn: '2026-11-22',
    lowBucketReturn: 0.66,
    highBucketReturn: -0.328,
    inSample: {
      window: 'Oct 2024 – Oct 2026', from: '2024-10-01', to: '2026-10-22',
      correlation: -0.1993, correlationCI: [-0.2913, -0.1349],
      expectancyR: -0.136, expectancyCI: [-0.299, 0.02],
      meanDailyIC: -0.0084, meanDailyICCI: [-0.0648, 0.0497],
      nullCorrelation: -0.1242,
      buyHoldPct: 1.1, strategyReturnPct: -10.7, samples: 83652, trades: 2046, heldOut: false,
    },
    outOfSample: {
      window: '2019–2022', from: '2019-01-01', to: '2022-12-02',
      correlation: -0.049, correlationCI: [-0.141, 0.0247],
      expectancyR: 0.119, expectancyCI: [0.007, 0.227],
      meanDailyIC: 0.0007, meanDailyICCI: [-0.0429, 0.0446],
      nullCorrelation: -0.0663,
      buyHoldPct: 121.4, strategyReturnPct: 51.1, samples: 152859, trades: 4231, heldOut: true,
    },
    study: 'docs/research/mid-engine-study.md',
    previous: { measuredOn: '2026-07-24', correlation: -0.1469, expectancyR: -0.034, profitFactor: 0.97, samples: 67832, symbols: 132 },
  },
  // Price-trend proxy only (not the fundamental score). Re-measured 2026-11-22
  // with the same methods (docs/research/short-long-remeasurement-plan.md); the
  // recent window was examined in July 2026, 2019–2022 is a first look.
  long: {
    correlation: -0.2931,
    expectancyR: -0.176,
    profitFactor: 0.77,
    samples: 77068,
    symbols: 165,
    horizonDays: 60,
    measuredOn: '2026-11-22',
    lowBucketReturn: 1.773,
    highBucketReturn: 0.336,
    isProxy: true,
    inSample: {
      window: 'Oct 2024 – Aug 2026', from: '2024-10-01', to: '2026-08-24',
      correlation: -0.2931, correlationCI: [-0.4371, -0.1964],
      expectancyR: -0.176, expectancyCI: [-0.448, 0.121],
      meanDailyIC: 0.0184, meanDailyICCI: [-0.0987, 0.1322],
      nullCorrelation: -0.253,
      buyHoldPct: 1.1, strategyReturnPct: -9.7, samples: 77068, trades: 1252, heldOut: false,
    },
    outOfSample: {
      window: '2019–2022', from: '2019-01-01', to: '2022-10-04',
      correlation: -0.0993, correlationCI: [-0.2527, 0.0081],
      expectancyR: 0.276, expectancyCI: [0.088, 0.455],
      meanDailyIC: 0.0385, meanDailyICCI: [-0.0392, 0.11],
      nullCorrelation: -0.137,
      buyHoldPct: 121.4, strategyReturnPct: 76.3, samples: 146339, trades: 2357, heldOut: true,
    },
    study: 'docs/research/engine-studies.md',
    previous: { measuredOn: '2026-07-24', correlation: -0.3459, expectancyR: -0.005, profitFactor: 1.03, samples: 62552, symbols: 132 },
  },
};

export type ValidationStatus = 'validated' | 'no-edge' | 'inverted' | 'regime-dependent';

/** The windows of a record that carry intervals and a shuffled-price baseline. */
function testedWindows(v: ValidationRecord): Required<Pick<WindowResult, 'correlation' | 'correlationCI' | 'expectancyR' | 'expectancyCI' | 'nullCorrelation'>>[] | null {
  const windows = [v.inSample, v.outOfSample];
  if (!windows.every((w) => w?.correlationCI && w.expectancyCI && w.nullCorrelation !== undefined)) return null;
  return windows as Required<WindowResult>[];
}

export function validationStatus(v: ValidationRecord): ValidationStatus {
  // Records with intervals and a shuffled-price baseline (docs/research/
  // mid-engine-preregistration.md) are judged on uncertainty, in every window.
  const tested = testedWindows(v);
  if (tested) {
    // The pre-registered rule: both intervals above zero and both estimates
    // above the thresholds used below, in every window.
    if (tested.every((w) => w.correlationCI[0] > 0 && w.correlation > 0.05 && w.expectancyCI[0] > 0 && w.expectancyR > 0.03)) return 'validated';
    // "Inverted" only if every window sits wholly below what shuffled,
    // unpredictable prices produce on the same measure.
    if (tested.every((w) => w.correlationCI[1] < w.nullCorrelation)) return 'inverted';
    return 'no-edge';
  }
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

const signed = (n: number, d: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const includesZero = (ci: [number, number] | undefined) => !!ci && ci[0] <= 0 && ci[1] >= 0;

/**
 * Plain-language evidence for a record measured in two windows with intervals
 * and a shuffled-price baseline, built only from the record's own numbers.
 * Each interpretive clause appears only when the figures support it, so the
 * wording stays true if a record is re-measured. Null for other records.
 */
export function testedEvidence(v: ValidationRecord): { lead: string; sentences: string[] } | null {
  if (!testedWindows(v) || !v.inSample || !v.outOfSample) return null;
  const a = v.inSample;
  const b = v.outOfSample;
  const aNull = a.nullCorrelation!;
  const bNull = b.nullCorrelation!;
  const status = validationStatus(v);
  const lead =
    status === 'validated'
      ? 'Validated in both of two separate periods.'
      : status === 'inverted'
        ? 'Not validated: in both periods the score did worse than shuffled, unpredictable prices on the same measure, which does not establish a profitable inverse strategy.'
        : 'No demonstrated edge in either of two separate periods.';
  // "Much of the reading comes from the measure": in every window the shuffled
  // baseline has the same sign and at least half the size of the real reading.
  const measureDriven = [[a.correlation, aNull], [b.correlation, bNull]].every(
    ([real, nul]) => Math.sign(real) === Math.sign(nul) && Math.abs(nul) >= 0.5 * Math.abs(real),
  );
  const sentences = [
    `The score’s correlation with ${v.horizonDays}-session returns was ${signed(a.correlation, 3)} (${a.window}) and ${signed(b.correlation, 3)} (${b.window}). Shuffled prices, where nothing is predictable, read ${signed(aNull, 3)} and ${signed(bNull, 3)} on the same measure${measureDriven ? ', so much of that reading comes from the measure itself' : ''}.`,
  ];
  if (a.meanDailyIC !== undefined && b.meanDailyIC !== undefined) {
    sentences.push(
      includesZero(a.meanDailyICCI) && includesZero(b.meanDailyICCI)
        ? `On any given day the score did not rank which stocks later did better (average rank correlation ${signed(a.meanDailyIC, 3)} and ${signed(b.meanDailyIC, 3)}).`
        : `Average daily rank correlation across stocks: ${signed(a.meanDailyIC, 3)} and ${signed(b.meanDailyIC, 3)}.`,
    );
  }
  sentences.push(
    `Simulated trades averaged ${signed(a.expectancyR, 2)}R and ${signed(b.expectancyR, 2)}R after costs${
      a.strategyReturnPct !== undefined && b.strategyReturnPct !== undefined
        ? `; trading the score returned ${signed(a.strategyReturnPct, 0)}% and ${signed(b.strategyReturnPct, 0)}% per stock, against ${signed(a.buyHoldPct, 0)}% and ${signed(b.buyHoldPct, 0)}% for buy-and-hold`
        : ''
    }.`,
  );
  return { lead, sentences };
}

/** One honest sentence about how much this engine's score has been worth. */
export function validationNote(tf: Timeframe): { status: ValidationStatus; text: string } {
  const v = ENGINE_VALIDATION[tf];
  const status = validationStatus(v);
  // The default study fetches three years of bars and spends the first 210
  // sessions on indicator warm-up, so decisions cover about the latest two years.
  const scope = `${v.symbols} stocks, ${v.samples.toLocaleString('en-IN')} samples, about two years of decisions, net of costs`;

  const evidence = testedEvidence(v);
  if (evidence) {
    return {
      status,
      text: `${evidence.lead} ${evidence.sentences.join(' ')}${v.isProxy ? ' Tested via a price-trend proxy; the fundamental score itself is not point-in-time testable.' : ''} Treat the score as a description, not a buy signal.`,
    };
  }

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
