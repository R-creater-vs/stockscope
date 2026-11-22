/**
 * Tests for scripts/research/stats.mjs, including agreement with the app's own
 * pooled-correlation definition in src/lib/backtest.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  circularBlockCounts, iidCounts, interval, pearson, pooledCorrelation, quantile, ranks, rng, spearman,
} from '../scripts/research/stats.mjs';
import { loadTs } from '../scripts/load-ts.mjs';
import { advance, decline } from './helpers.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('pearson: perfect, inverse and undefined cases', () => {
  close(pearson([1, 2, 3], [2, 4, 6]), 1);
  close(pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), 0, 'zero variance → 0, as in the app');
  assert.equal(pearson([1], [1]), 0);
});

test('ranks: ties share their average rank', () => {
  assert.deepEqual(ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
  assert.deepEqual(ranks([3, 1, 2]), [3, 1, 2]);
});

test('spearman: monotone but non-linear is a perfect rank correlation', () => {
  close(spearman([1, 2, 3, 4], [1, 8, 27, 64]), 1);
  assert.ok(pearson([1, 2, 3, 4], [1, 8, 27, 64]) < 1);
});

test('quantile: linear interpolation', () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test('rng: same seed, same sequence; values in [0, 1)', () => {
  const a = rng(7);
  const b = rng(7);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('circularBlockCounts: fills exactly n positions in whole blocks that wrap', () => {
  const counts = circularBlockCounts(10, 4, rng(1));
  assert.equal(counts.reduce((s, x) => s + x, 0), 10);
  // Every block starts at position 8 and wraps: 8-9-0-1, 8-9-0-1, then 8-9 fills the last two.
  const fixed = circularBlockCounts(10, 4, () => 0.8);
  assert.deepEqual([...fixed], [2, 2, 0, 0, 0, 0, 0, 0, 3, 3]);
});

test('iidCounts: n draws in total', () => {
  assert.equal(iidCounts(50, rng(3)).reduce((s, x) => s + x, 0), 50);
});

test('interval: percentile bounds and standard error', () => {
  const reps = Array.from({ length: 1001 }, (_, i) => i / 1000);
  const ci = interval(reps);
  close(ci.lo, 0.025, 1e-12);
  close(ci.hi, 0.975, 1e-12);
  assert.ok(ci.se > 0.28 && ci.se < 0.3);
  assert.equal(interval([1, NaN, 2]).reps, 2, 'non-finite replicates are ignored');
});

test('pooledCorrelation: equals the app aggregate on unit weights', () => {
  // Two symbols with different sample counts, so the weighting matters.
  const sym = [0, 0, 0, 0, 1, 1, 1];
  const x = [1, 2, 3, 4, 5, 6, 7];
  const y = [2, 1, 4, 3, 1, 1, 2];
  const r0 = pearson(x.slice(0, 4), y.slice(0, 4));
  const r1 = pearson(x.slice(4), y.slice(4));
  close(pooledCorrelation(sym, x, y, () => 1, 2), (4 * r0 + 3 * r1) / 7, 1e-12);
});

test('pooledCorrelation: integer weights equal repeating the samples', () => {
  const sym = [0, 0, 0, 0];
  const x = [1, 2, 3, 4];
  const y = [1, 3, 2, 5];
  const weights = [2, 1, 0, 3];
  const xs = [1, 1, 2, 4, 4, 4];
  const ys = [1, 1, 3, 5, 5, 5];
  close(pooledCorrelation(sym, x, y, (i) => weights[i], 1), pearson(xs, ys), 1e-12);
});

test('pooledCorrelation: reproduces the app\'s backtest aggregate on real engine output', () => {
  const { backtestSymbol, aggregate, ENGINE_CONFIGS, midStrategy } = loadTs('src/lib/backtest');
  const config = { ...ENGINE_CONFIGS.mid, warmup: 210 };
  // Two synthetic stocks long enough for the mid engine (fixtures, not market data).
  const a = [...decline(120, 400), ...advance(200, 162, 120)];
  const b = [...advance(160, 100), ...decline(160, 418, 160)];
  const runs = [backtestSymbol('A', a, config, undefined, midStrategy), backtestSymbol('B', b, config, undefined, midStrategy)];
  const app = aggregate(runs).signal.correlation;

  // Rebuild the same samples independently and pool them with stats.mjs.
  const { analyzeMidTerm } = loadTs('src/lib/midterm');
  const sym = [];
  const x = [];
  const y = [];
  [a, b].forEach((bars, s) => {
    for (let i = config.warmup; i < bars.length - config.signalHorizon; i++) {
      sym.push(s);
      x.push(analyzeMidTerm(bars.slice(0, i + 1)).score);
      y.push(((bars[i + config.signalHorizon].close - bars[i].close) / bars[i].close) * 100);
    }
  });
  close(pooledCorrelation(sym, x, y, () => 1, 2), app, 1e-9);
});
