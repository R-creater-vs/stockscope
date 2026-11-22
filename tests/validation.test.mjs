/**
 * The validation status shown beside every score must follow the stated rules,
 * including the stricter interval-and-baseline rule for records that have them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';

const { ENGINE_VALIDATION, validationStatus, validationNote, testedEvidence } = loadTs('src/lib/validation');

const tested = (a, b) => ({
  correlation: a.correlation, expectancyR: a.expectancyR, profitFactor: 1, samples: 1, symbols: 1,
  horizonDays: 20, measuredOn: '2026-11-22', lowBucketReturn: 0, highBucketReturn: 0,
  inSample: { window: 'A', buyHoldPct: 0, ...a }, outOfSample: { window: 'B', buyHoldPct: 0, ...b },
});

test('stored records: all three engines re-measured with intervals show no edge', () => {
  for (const tf of ['short', 'mid', 'long']) {
    assert.equal(validationStatus(ENGINE_VALIDATION[tf]), 'no-edge', tf);
    assert.equal(ENGINE_VALIDATION[tf].measuredOn, '2026-11-22', `${tf} re-measured`);
    assert.ok(ENGINE_VALIDATION[tf].previous, `${tf} keeps its earlier record`);
  }
  assert.equal(ENGINE_VALIDATION.long.isProxy, true);
});

test('held-out flags: only windows never run for that engine before their plan', () => {
  assert.equal(ENGINE_VALIDATION.mid.outOfSample.heldOut, true);
  assert.equal(ENGINE_VALIDATION.mid.inSample.heldOut, false);
  assert.equal(ENGINE_VALIDATION.long.outOfSample.heldOut, true);
  assert.equal(ENGINE_VALIDATION.long.inSample.heldOut, false);
  // Both short windows were run in July 2026, so this is a re-measurement.
  assert.equal(ENGINE_VALIDATION.short.inSample.heldOut, false);
  assert.equal(ENGINE_VALIDATION.short.outOfSample.heldOut, false);
});

test('short record: the July sign change is not read as a regime effect', () => {
  const v = ENGINE_VALIDATION.short;
  assert.equal(v.previous.correlation, -0.0717, 'July figure kept as history');
  assert.notEqual(validationStatus(v), 'regime-dependent');
  // The 2019–2022 interval includes both zero and that window's shuffled baseline.
  const b = v.outOfSample;
  assert.ok(b.correlationCI[0] < 0 && b.correlationCI[1] > 0);
  assert.ok(b.correlationCI[0] < b.nullCorrelation && b.nullCorrelation < b.correlationCI[1]);
});

test('mid record: the old single-number rule would have said inverted; the interval rule does not', () => {
  const v = ENGINE_VALIDATION.mid;
  assert.ok(v.correlation < -0.05, 'the headline correlation alone is below −0.05');
  assert.ok(v.outOfSample.correlationCI[1] > v.outOfSample.nullCorrelation, '2019–2022 interval reaches above its shuffled baseline');
});

test('every stored window carries intervals and a baseline that bracket its estimate', () => {
  for (const w of ['short', 'mid', 'long'].flatMap((tf) => [ENGINE_VALIDATION[tf].inSample, ENGINE_VALIDATION[tf].outOfSample])) {
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
  assert.match(note.text, /No demonstrated edge in either of two separate periods/);
  assert.match(note.text, /2019–2022/);
  assert.match(note.text, /read −0\.124 and −0\.066 on the same measure/);
});

test('testedEvidence: the mid record earns each interpretive clause from its numbers', () => {
  const text = testedEvidence(ENGINE_VALIDATION.mid).sentences.join(' ');
  assert.match(text, /so much of that reading comes from the measure itself/);
  assert.match(text, /did not rank which stocks later did better/);
  assert.match(text, /returned −11% and \+51% per stock, against \+1% and \+121% for buy-and-hold/);
});

test('testedEvidence: the short record gets the ranking clause but not the measure clause', () => {
  const text = testedEvidence(ENGINE_VALIDATION.short).sentences.join(' ');
  // Recent shuffled baseline is under half the real reading, and in 2019–2022
  // the real reading and the baseline have opposite signs.
  assert.doesNotMatch(text, /comes from the measure itself/);
  assert.match(text, /did not rank which stocks later did better/);
  assert.match(text, /10-session returns was −0\.073 \(Oct 2024 – Nov 2026\) and \+0\.012 \(2019–2022\)/);
  assert.match(text, /returned −20% and \+18% per stock, against \+1% and \+121% for buy-and-hold/);
});

test('testedEvidence: clauses are withheld when the numbers do not support them', () => {
  const w = (o) => ({ correlationCI: [-0.3, -0.1], expectancyR: -0.1, expectancyCI: [-0.2, 0.01], buyHoldPct: 0, ...o });
  const v = tested(
    w({ correlation: -0.2, nullCorrelation: -0.02, meanDailyIC: 0.05, meanDailyICCI: [0.01, 0.09] }),
    w({ correlation: -0.2, nullCorrelation: -0.02, meanDailyIC: 0.04, meanDailyICCI: [0.005, 0.08] }),
  );
  const text = testedEvidence(v).sentences.join(' ');
  assert.doesNotMatch(text, /comes from the measure itself/, 'baseline far smaller than the real reading');
  assert.doesNotMatch(text, /did not rank/, 'ranking intervals exclude zero');
  assert.doesNotMatch(text, /buy-and-hold/, 'no strategy returns recorded');
});

test('testedEvidence: records without intervals get no generated text', () => {
  const v = tested({ correlation: -0.1, expectancyR: 0 }, { correlation: 0.1, expectancyR: 0 });
  assert.equal(testedEvidence(v), null);
});
