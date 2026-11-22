/**
 * Rule tests for src/lib/candlePatterns.ts: each formation is detected when
 * its written rule holds, NOT detected on near misses, and its status follows
 * the confirmation / invalidation / no-look-ahead rules in docs/weeks-to-months.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';
import { advance, byName, decline, flat, next } from './helpers.mjs';

const { scanCandles, weeklyCandles, CONFIRM_BARS } = loadTs('src/lib/candlePatterns');
const daily = (bars, lastBarComplete = true) => scanCandles(bars, { timeframe: 'daily', lastBarComplete });

// After 25 falling bars the last close is 152. A hammer: body 1 (150 → 151),
// lower shadow 3 (≥ 2× body), upper shadow 0.05 (small). Formation high 151.05, low 147.
const hammerAfterDecline = () => next(decline(25), 150, 151.05, 147, 151);

test('hammer: hammer shape after a decline is a bullish Hammer', () => {
  const [p] = byName(daily(hammerAfterDecline()), 'Hammer');
  assert.ok(p, 'expected a Hammer');
  assert.equal(p.direction, 'bullish');
  assert.equal(p.complete, true);
  assert.equal(p.status, 'awaiting', 'no later bars yet, so it can be neither confirmed nor invalidated');
  assert.match(p.trendContext, /Prior decline/);
});

test('hammer: the same shape after an advance is a bearish Hanging man, not a Hammer', () => {
  // Last advancing close is 148; same proportions as the hammer above.
  const scan = daily(next(advance(25), 149, 150.05, 146, 150));
  assert.equal(byName(scan, 'Hammer').length, 0);
  const [p] = byName(scan, 'Hanging man');
  assert.ok(p, 'expected a Hanging man');
  assert.equal(p.direction, 'bearish');
});

test('hammer: the same shape with no prior trend is not named at all', () => {
  const scan = daily(next(flat(25), 150, 151.05, 148, 151));
  assert.equal(byName(scan, 'Hammer').length, 0);
  assert.equal(byName(scan, 'Hanging man').length, 0);
});

test('hammer: lower shadow under 2× the body is a near miss and is not reported', () => {
  // Lower shadow 1.9 against a body of 1.
  const scan = daily(next(decline(25), 150, 151.05, 148.1, 151));
  assert.equal(byName(scan, 'Hammer').length, 0);
});

test('status: a later completed close above the formation high confirms it, dated that bar', () => {
  const bars = next(hammerAfterDecline(), 151, 152.5, 150.8, 152);
  const [p] = byName(daily(bars), 'Hammer');
  assert.equal(p.status, 'confirmed');
  assert.equal(p.statusDate, bars.at(-1).date);
});

test('status: a completed close below the formation low first invalidates it', () => {
  const bars = next(hammerAfterDecline(), 150, 150.5, 145.5, 146);
  const [p] = byName(daily(bars), 'Hammer');
  assert.equal(p.status, 'invalidated');
  assert.equal(p.statusDate, bars.at(-1).date);
});

test(`status: ${CONFIRM_BARS} completed bars inside the range expire it; fewer leave it awaiting`, () => {
  let bars = hammerAfterDecline();
  bars = next(bars, 149, 150, 148.5, 149.5);
  assert.equal(byName(daily(bars), 'Hammer')[0].status, 'awaiting');
  bars = next(bars, 149, 150, 148.5, 149.5);
  bars = next(bars, 149, 150, 148.5, 149.5);
  assert.equal(byName(daily(bars), 'Hammer')[0].status, 'expired');
});

test('no look-ahead: a formation ending on an in-progress bar is forming, never confirmed', () => {
  const [p] = byName(daily(hammerAfterDecline(), false), 'Hammer');
  assert.equal(p.status, 'forming');
  assert.equal(p.complete, false);
});

test('no look-ahead: unknown completion is treated as in progress', () => {
  const [p] = byName(daily(hammerAfterDecline(), null), 'Hammer');
  assert.equal(p.status, 'forming');
  assert.equal(p.complete, null);
  assert.match(p.statusNote, /could not be determined/);
});

test('no look-ahead: an in-progress bar closing above the high does not confirm', () => {
  const bars = next(hammerAfterDecline(), 151, 152.5, 150.8, 152);
  const [p] = byName(daily(bars, false), 'Hammer');
  assert.equal(p.status, 'awaiting', 'the confirming bar has not closed yet');
});

test('doji: a small body in a normal-sized range is a neutral Doji', () => {
  // Body 0.05 of a 3.0 range (≤ 10%); range equals the 10-bar average of 3.
  const [p] = byName(daily(next(decline(25), 150, 151.5, 148.5, 150.05)), 'Doji');
  assert.ok(p, 'expected a Doji');
  assert.equal(p.direction, 'neutral');
});

test('doji: a tiny bar (range under half the average) is ignored', () => {
  // Range 1.0 against an average of 3.0.
  const scan = daily(next(decline(25), 150, 150.6, 149.6, 150.05));
  assert.equal(byName(scan, 'Doji').length, 0);
});

test('engulfing: a larger rising body covering the prior falling body after a decline', () => {
  // Prior bar 153 → 152; this bar 151.5 → 154 covers it with a larger body.
  const [p] = byName(daily(next(decline(25), 151.5, 154.2, 151.3, 154)), 'Bullish engulfing');
  assert.ok(p, 'expected a Bullish engulfing');
  assert.equal(p.direction, 'bullish');
  assert.equal(p.dates.length, 2);
});

test('engulfing: a body that does not reach the prior open is not engulfing', () => {
  const scan = daily(next(decline(25), 151.5, 153, 151.3, 152.8));
  assert.equal(byName(scan, 'Bullish engulfing').length, 0);
});

test('engulfing: the same two bars with no prior decline are not named', () => {
  // Prior flat bar 150.5 → 150; this bar 149.9 → 151 covers it with a larger body.
  const scan = daily(next(flat(25), 149.9, 151.2, 149.8, 151));
  assert.equal(byName(scan, 'Bullish engulfing').length, 0);
});

test('too few bars: returns a note instead of patterns', () => {
  const scan = daily(decline(10));
  assert.equal(scan.patterns.length, 0);
  assert.match(scan.note, /at least 23/);
});

test('weekly candles: aggregate Monday-keyed weeks and only treat a completed Friday as final', () => {
  const week = [
    { date: '2026-11-16', open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { date: '2026-11-17', open: 11, high: 13, low: 10, close: 12, volume: 100 },
    { date: '2026-11-18', open: 12, high: 15, low: 11, close: 14, volume: 100 },
    { date: '2026-11-19', open: 14, high: 14, low: 8, close: 9, volume: 100 },
    { date: '2026-11-20', open: 9, high: 10, low: 9, close: 10, volume: 100 },
  ];
  const full = weeklyCandles(week, true);
  assert.deepEqual(full.bars, [{ date: '2026-11-16', open: 10, high: 15, low: 8, close: 10, volume: 500 }]);
  assert.equal(full.lastComplete, true);
  assert.equal(weeklyCandles(week, null).lastComplete, null, 'Friday bar of unknown completion');
  assert.equal(weeklyCandles(week.slice(0, 4), true).lastComplete, false, 'week ending Thursday is incomplete');
});
