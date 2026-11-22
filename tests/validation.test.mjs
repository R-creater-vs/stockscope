/**
 * The validation status shown beside every score must follow the stated rules,
 * including the stricter interval-and-baseline rule for records that have them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';

const { ENGINE_VALIDATION, validationStatus, validationNote } = loadTs('src/lib/validation');

const tested = (a, b) => ({
  correlation: a.correlation, expectancyR: a.expectancyR, profitFactor: 1, samples: 1, symbols: 1,
  horizonDays: 20, measuredOn: '2026-11-22', lowBucketReturn: 0, highBucketReturn: 0,
  inSample: { window: 'A', buyHoldPct: 0, ...a }, outOfSample: { window: 'B', buyHoldPct: 0, ...b },
});

test('stored records: short regime-dependent, mid no edge, long inverted (proxy)', () => {
  assert.equal(validationStatus(ENGINE_VALIDATION.short), 'regime-dependent');
  assert.equal(validationStatus(ENGINE_VALIDATION.mid), 'no-edge');
  assert.equal(validationStatus(ENGINE_VALIDATION.long), 'inverted');
});

test('mid record: the old single-number rule would have said inverted; the interval rule does not', () => {
  const v = ENGINE_VALIDATION.mid;
  assert.ok(v.correlation < -0.05, 'the headline correlation alone is below −0.05');
  assert.ok(v.outOfSample.correlationCI[1] > v.outOfSample.nullCorrelation, '2019–2022 interval reaches above its shuffled baseline');
});

test('mid record: every tested window carries intervals and a baseline that bracket its estimate', () => {
  for (const w of [ENGINE_VALIDATION.mid.inSample, ENGINE_VALIDATION.mid.outOfSample]) {
    assert.ok(w.correlationCI[0] <= w.correlation && w.correlation <= w.correlationCI[1], `${w.window} correlation inside its interval`);
    assert.ok(w.expectancyCI[0] <= w.expectancyR && w.expectancyR <= w.expectancyCI[1], `${w.window} expectancy inside its interval`);
    assert.equal(typeof w.nullCorrelation, 'number');
    assert.ok(w.from < w.to);
  }
});

test('tested record: validated only when every window clears zero and the thresholds', () => {
  const good = { correlation: 0.08, correlationCI: [0.02, 0.14], expectancyR: 0.05, expectancyCI: [0.01, 0.09], nullCorrelation: -0.05 };
  assert.equal(validationStatus(tested(good, good)), 'validated');
  const weak = { ...good, correlationCI: [-0.01, 0.14] };
  assert.equal(validationStatus(tested(good, weak)), 'no-edge', 'one interval touching zero is not enough');
  const lowR = { ...good, expectancyR: 0.02, expectancyCI: [0.001, 0.04] };
  assert.equal(validationStatus(tested(good, lowR)), 'no-edge', 'expectancy under the 0.03R threshold');
});

test('tested record: inverted only when every window sits wholly below its shuffled baseline', () => {
  const below = { correlation: -0.3, correlationCI: [-0.4, -0.2], expectancyR: -0.1, expectancyCI: [-0.2, 0], nullCorrelation: -0.1 };
  assert.equal(validationStatus(tested(below, below)), 'inverted');
  const nearNull = { ...below, correlationCI: [-0.4, -0.05] };
  assert.equal(validationStatus(tested(below, nearNull)), 'no-edge');
});

test('validationNote: the mid note names both periods and the shuffled baseline', () => {
  const note = validationNote('mid');
  assert.equal(note.status, 'no-edge');
  assert.match(note.text, /no demonstrated edge in either of two separate periods/);
  assert.match(note.text, /2019–2022/);
  assert.match(note.text, /shuffled prices read −0\.12 and −0\.07/);
});
