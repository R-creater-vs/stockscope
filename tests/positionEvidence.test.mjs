/**
 * Tests for the date, bar-completion and sector-benchmark rules that the
 * weeks-to-months evidence depends on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../scripts/load-ts.mjs';

const { istDate, lastBarCompletion } = loadTs('src/lib/positionEvidence');
const { chooseSectorBenchmark } = loadTs('src/lib/sectorBenchmarks');

test('istDate: converts UTC instants to the India calendar date', () => {
  assert.equal(istDate('2026-11-20T18:29:00Z'), '2026-11-20', '23:59 IST');
  assert.equal(istDate('2026-11-20T18:30:00Z'), '2026-11-21', '00:00 IST next day');
});

test('lastBarCompletion: a bar from an earlier IST date is complete', () => {
  assert.equal(lastBarCompletion('2026-11-19', 'REGULAR', '2026-11-20T05:00:00Z'), true);
});

test('lastBarCompletion: today\'s bar depends on the market state', () => {
  const at = '2026-11-20T08:00:00Z'; // 13:30 IST
  assert.equal(lastBarCompletion('2026-11-20', 'REGULAR', at), false);
  assert.equal(lastBarCompletion('2026-11-20', 'PRE', at), false);
  assert.equal(lastBarCompletion('2026-11-20', 'CLOSED', at), true);
  assert.equal(lastBarCompletion('2026-11-20', 'POST', at), true);
  assert.equal(lastBarCompletion('2026-11-20', null, at), null, 'unknown stays unknown');
});

test('sector benchmark: universe bank stock with a bank industry maps directly to Nifty Bank', () => {
  const c = chooseSectorBenchmark({ symbol: 'HDFCBANK.NS', sector: null, industry: 'Banks - Regional' });
  assert.equal(c.index.symbol, '^NSEBANK');
  assert.equal(c.fit, 'direct');
});

test('sector benchmark: universe financial with no industry falls back to an approximate index', () => {
  const c = chooseSectorBenchmark({ symbol: 'BAJFINANCE.NS', sector: null, industry: null });
  assert.equal(c.index.symbol, 'NIFTY_FIN_SERVICE.NS');
  assert.equal(c.fit, 'approximate');
});

test('sector benchmark: a BSE listing uses its NSE universe entry', () => {
  const c = chooseSectorBenchmark({ symbol: 'INFY.BO', sector: null, industry: 'Information Technology Services' });
  assert.equal(c.index.symbol, '^CNXIT');
  assert.equal(c.fit, 'direct');
});

test('sector benchmark: Materials has no index and says why', () => {
  const c = chooseSectorBenchmark({ symbol: 'ULTRACEMCO.NS', sector: 'Basic Materials', industry: 'Building Materials' });
  assert.equal(c.index, null);
  assert.match(c.basis, /Nifty Commodities series is unavailable/);
});

test('sector benchmark: stocks outside the universe map from provider sector and industry', () => {
  assert.equal(chooseSectorBenchmark({ symbol: 'XYZ.NS', sector: 'Consumer Cyclical', industry: 'Auto Parts' }).index.symbol, '^CNXAUTO');
  assert.equal(chooseSectorBenchmark({ symbol: 'XYZ.NS', sector: 'Basic Materials', industry: 'Steel' }).index.symbol, '^CNXMETAL');
  assert.equal(chooseSectorBenchmark({ symbol: 'XYZ.NS', sector: 'Basic Materials', industry: 'Specialty Chemicals' }).index, null);
  assert.equal(chooseSectorBenchmark({ symbol: 'XYZ.NS', sector: null, industry: null }).index, null);
});
