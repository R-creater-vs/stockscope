/**
 * Placeholder bars (no trading recorded) are dropped; real bars, including
 * unusual ones, are kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';

const { isPlaceholderBar, dropPlaceholderBars } = loadTs('src/lib/barQuality');
const bar = (date, open, high, low, close, volume) => ({ date, open, high, low, close, volume });

test('the Yahoo placeholder seen on 2025-03-18 is detected', () => {
  // TCS.NS as returned by Yahoo: every price equals the previous close, no volume.
  assert.equal(isPlaceholderBar(bar('2025-03-18', 3497.699951171875, 3497.699951171875, 3497.699951171875, 3497.699951171875, 0)), true);
});

test('real bars are kept, including unusual ones', () => {
  assert.equal(isPlaceholderBar(bar('d', 100, 102, 99, 101, 5000)), false, 'normal session');
  assert.equal(isPlaceholderBar(bar('d', 100, 100, 100, 100, 250)), false, 'traded at a single price');
  assert.equal(isPlaceholderBar(bar('d', 100, 101, 99, 100, 0)), false, 'zero volume but a real range (e.g. an index)');
});

test('dropPlaceholderBars removes only placeholders and keeps order', () => {
  const bars = [
    bar('2025-03-17', 3489, 3530.45, 3477.35, 3497.7, 2690906),
    bar('2025-03-18', 3497.7, 3497.7, 3497.7, 3497.7, 0),
    bar('2025-03-19', 3547, 3547, 3462.75, 3497.1, 3051244),
  ];
  assert.deepEqual(dropPlaceholderBars(bars).map((b) => b.date), ['2025-03-17', '2025-03-19']);
  assert.deepEqual(dropPlaceholderBars([]), []);
});
