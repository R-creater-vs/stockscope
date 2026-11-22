/**
 * Rule tests for src/lib/indicatorEvents.ts: crossovers, breakouts and RSI
 * divergences follow their written rules, and no event is confirmed by a bar
 * that has not completed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';
import { bar, dateAt, fromCloses } from './helpers.mjs';

const { latestCross, scanIndicatorEvents } = loadTs('src/lib/indicatorEvents');
const { rsi } = loadTs('src/lib/indicators');
const dates = (n) => Array.from({ length: n }, (_, i) => dateAt(i));
const noWeekly = { bars: [], lastComplete: null };
const events = (bars, complete = true) => scanIndicatorEvents(bars, noWeekly, complete).events;

/* -------------------------------------------------------------- latestCross */

test('latestCross: an upward cross held for the required bars is confirmed', () => {
  const c = latestCross([-1, -1, -1, 1, 1, 1, 1], 0, dates(7), 6, 3);
  assert.equal(c.direction, 'up');
  assert.equal(c.index, 3);
  assert.equal(c.heldBars, 4);
  assert.equal(c.status, 'confirmed');
  assert.equal(c.statusDate, dateAt(5), 'confirmed on the third bar on the new side');
});

test('latestCross: holding for exactly the required bars is enough', () => {
  const c = latestCross([-1, -1, -1, 1, 1, 1], 0, dates(6), 5, 3);
  assert.equal(c.heldBars, 3);
  assert.equal(c.status, 'confirmed');
  assert.equal(c.statusDate, dateAt(5));
});

test('latestCross: fewer bars than the hold leaves it awaiting', () => {
  const c = latestCross([-1, -1, -1, 1, 1, 1, 1], 0, dates(7), 4, 3);
  assert.equal(c.status, 'awaiting');
  assert.equal(c.heldBars, 2);
  assert.equal(c.statusDate, null);
});

test('latestCross: a cross on a bar after lastComplete is not seen', () => {
  assert.equal(latestCross([-1, -1, -1, -1, -1, 1], 0, dates(6), 4, 3), null);
});

test('latestCross: reports the most recent change of side', () => {
  const c = latestCross([-1, 1, 1, -1, -1], 0, dates(5), 4, 2);
  assert.equal(c.direction, 'down');
  assert.equal(c.index, 3);
});

test('latestCross: crosses before `from` are outside the lookback', () => {
  assert.equal(latestCross([-1, 1, 1, 1, 1, 1], 0, dates(6), 5, 2, 3), null);
});

test('latestCross: compares two series bar by bar and skips missing values', () => {
  const c = latestCross([null, 1, 1, 3, 3], [null, 2, 2, 2, 2], dates(5), 4, 2);
  assert.equal(c.direction, 'up');
  assert.equal(c.index, 3);
});

/* ---------------------------------------------------------------- breakouts */

/** 100 flat bars (close 100, high 101, low 99) with the bars at `overrides` replaced. */
function flatWith(overrides, n = 100) {
  return Array.from({ length: n }, (_, i) => overrides[i] ?? bar(dateAt(i), 100, 101, 99, 100, 1000));
}
const breakoutOf = (evs) => evs.find((e) => e.kind === 'breakout');

test('breakout: close above the prior 63-session high, volume-confirmed, then follow-through', () => {
  const bars = flatWith({
    95: bar(dateAt(95), 100, 103.5, 100, 103, 2000),
    96: bar(dateAt(96), 103, 103, 102, 102.5),
    97: bar(dateAt(97), 102.5, 103, 102, 102.5),
    98: bar(dateAt(98), 102.5, 103, 102, 102.5),
    99: bar(dateAt(99), 102.5, 103, 102, 102.5),
  });
  const b = breakoutOf(events(bars));
  assert.ok(b, 'expected a breakout event');
  assert.equal(b.direction, 'bullish');
  assert.equal(b.date, dateAt(95));
  assert.match(b.name, /63-session/);
  assert.match(b.reading, /2\.00× .*meets the 1\.5× volume rule/);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.statusDate, dateAt(98));
});

test('breakout: a close back inside the old range within 3 bars marks it failed', () => {
  const bars = flatWith({
    95: bar(dateAt(95), 100, 103.5, 100, 103, 2000),
    96: bar(dateAt(96), 103, 103, 102, 102.5),
    97: bar(dateAt(97), 102.5, 102.5, 100, 100.5),
  });
  const b = breakoutOf(events(bars));
  assert.equal(b.status, 'failed');
  assert.equal(b.statusDate, dateAt(97));
});

test('breakout: low volume is reported as below the volume rule', () => {
  const b = breakoutOf(events(flatWith({ 95: bar(dateAt(95), 100, 103.5, 100, 103, 1200) })));
  assert.match(b.reading, /below the 1\.5× volume rule/);
});

test('no look-ahead: a breakout on an in-progress bar is not reported', () => {
  const bars = flatWith({ 99: bar(dateAt(99), 100, 103.5, 100, 103, 2000) });
  assert.equal(breakoutOf(events(bars, false)), undefined);
  assert.equal(breakoutOf(events(bars, null)), undefined, 'unknown completion counts as in progress');
  assert.equal(breakoutOf(events(bars, true)).status, 'awaiting');
});

/* ---------------------------------------------------------------- divergence */

/**
 * Flat, then a steep rally to a pivot high (RSI pinned at 100), a pullback, a
 * gentler rally to a HIGHER price high with a LOWER RSI, then a decline that
 * confirms the second pivot. Hand-checked: pivot highs at bars 60 and 95.
 */
function bearishDivergenceCloses() {
  const c = [];
  for (let i = 0; i <= 40; i++) c.push(100);
  for (let i = 1; i <= 20; i++) c.push(100 + 2 * i); // bar 60: 140
  for (let i = 1; i <= 15; i++) c.push(140 - i); // bar 75: 125
  for (let i = 1; i <= 20; i++) c.push(125 + 0.85 * i); // bar 95: 142
  for (let i = 1; i <= 14; i++) c.push(142 - i); // bar 109: 128
  return c;
}

test('divergence: higher price high with RSI at least 2 points lower is a bearish divergence', () => {
  const bars = fromCloses(bearishDivergenceCloses());
  const d = events(bars).find((e) => e.kind === 'divergence');
  assert.ok(d, 'expected a divergence');
  assert.equal(d.name, 'Bearish RSI divergence');
  assert.equal(d.date, dateAt(100), 'recognised only when the second pivot is confirmed, 5 bars later');
  assert.equal(d.status, 'active');
});

test('divergence: a later close above the latest pivot high invalidates it', () => {
  const closes = bearishDivergenceCloses();
  closes.splice(106, 4, 143, 143.5, 144, 144.5);
  const d = events(fromCloses(closes)).find((e) => e.kind === 'divergence');
  assert.equal(d.status, 'invalidated');
  assert.equal(d.statusDate, dateAt(106));
});

test('divergence: none is reported when RSI confirms the new high', () => {
  // Two valid pivot highs 46 sessions apart with a higher price high, but the
  // second rally is long and steep enough that RSI is NOT 2 points lower.
  const c = [];
  for (let i = 0; i <= 40; i++) c.push(100);
  for (let i = 1; i <= 20; i++) c.push(100 + 2 * i); // bar 60: 140
  for (let i = 1; i <= 6; i++) c.push(140 - i); // five lower bars confirm the pivot
  for (let i = 1; i <= 40; i++) c.push(134 + 2 * i); // bar 106: 214
  for (let i = 1; i <= 14; i++) c.push(214 - i);
  const bars = fromCloses(c);
  // Pin the fixture down, so this test can only pass because of the RSI rule.
  const r = rsi(c, 14);
  assert.ok(bars[106].high > bars[60].high, 'price makes a higher high');
  assert.ok(r[106] > r[60] - 2, `RSI is not 2 points lower (${r[60]} → ${r[106]})`);
  assert.equal(events(bars).find((e) => e.kind === 'divergence'), undefined);
});

test('divergence: none is reported when RSI is lower but price makes a LOWER high', () => {
  // As the bearish fixture, but the second rally stops below the first peak.
  const c = [];
  for (let i = 0; i <= 40; i++) c.push(100);
  for (let i = 1; i <= 20; i++) c.push(100 + 2 * i); // bar 60: 140
  for (let i = 1; i <= 15; i++) c.push(140 - i); // bar 75: 125
  for (let i = 1; i <= 20; i++) c.push(125 + 0.6 * i); // bar 95: 137
  for (let i = 1; i <= 14; i++) c.push(137 - i);
  const bars = fromCloses(c);
  const r = rsi(c, 14);
  assert.ok(bars[95].high < bars[60].high, 'price makes a lower high');
  assert.ok(r[95] <= r[60] - 2, `RSI is at least 2 points lower (${r[60]} → ${r[95]})`);
  assert.equal(events(bars).find((e) => e.kind === 'divergence'), undefined);
});

/* ------------------------------------------------------------------- states */

test('states: current levels are labelled as states, separate from transitions', () => {
  const evs = events(fromCloses(bearishDivergenceCloses()));
  const rsiState = evs.find((e) => e.id === 'state:rsi');
  assert.equal(rsiState.kind, 'state');
  assert.equal(rsiState.direction, 'neutral');
  assert.equal(rsiState.status, 'current');
});

test('too few bars: no events, with a note', () => {
  const scan = scanIndicatorEvents(fromCloses(Array(40).fill(100)), noWeekly, true);
  assert.equal(scan.events.length, 0);
  assert.match(scan.notes[0], /at least 60/);
});
