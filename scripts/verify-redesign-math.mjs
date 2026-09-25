/**
 * Frozen numerical regression cases for the NIVRA presentation migration.
 *
 * The 18 cases were first compared to the pre-redesign Git HEAD and matched
 * every numeric field, verdict, confidence label and signal direction.
 * Synthetic bars are test fixtures, never product data.
 *
 * Run: node scripts/verify-redesign-math.mjs
 * --print-fixture prints candidate baselines for review; it never writes them.
 * Do not replace the fixture merely to make a scoring change pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(name) {
  const file = name.endsWith('.ts') ? name : name + '.ts';
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  vm.runInNewContext('(function(require,module,exports){' + js + '\n})', {
    console, Date, Math, Number, Map, Set,
  })((relative) => relative.startsWith('.')
    ? load(path.posix.join(path.posix.dirname(file), relative))
    : require(relative), mod, mod.exports);
  return mod.exports;
}
function numeric(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(numeric).filter((item) => item !== undefined);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, numeric(item)]).filter(([, item]) => item !== undefined),
  );
}

const printing = process.argv.includes('--print-fixture');
const expected = printing ? {} : JSON.parse(fs.readFileSync(new URL('./redesign-math-fixture.json', import.meta.url), 'utf8'));
const results = {};
for (const trend of [-0.35, 0, 0.35]) for (const length of [240, 650]) {
  const bars = Array.from({ length }, (_, index) => {
    const close = 700 + trend * index + Math.sin(index / 8) * 15 + Math.cos(index / 17) * 8;
    return {
      date: new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10),
      open: close - 1.2, high: close + 4, low: close - 3, close,
      volume: 100000 + (index % 13) * 7000,
    };
  });
  const fundamentals = new Proxy({
    peRatio: 18, pegRatio: 1.1, priceToBook: 3, returnOnEquity: 0.2,
    operatingMargin: 0.18, profitMargin: 0.12, revenueGrowth: 0.11,
    earningsGrowth: 0.08, debtToEquity: 35, currentRatio: 1.8,
    promoterHolding: 0.55, institutionalHolding: 0.2,
  }, { get: (target, key) => target[key] ?? null });
  for (const [file, fn, args] of [
    ['src/lib/swing.ts', 'analyzeSwing', [bars]],
    ['src/lib/midterm.ts', 'analyzeMidTerm', [bars]],
    ['src/lib/longterm.ts', 'analyzeLongTerm', [bars, fundamentals]],
  ]) {
    const analysis = load(file)[fn](...args);
    const key = fn + '/' + trend + '/' + length;
    const result = {
      numericHash: createHash('sha256').update(JSON.stringify(numeric(analysis))).digest('hex'),
      verdict: analysis.verdict,
      confidenceLabel: analysis.confidenceLabel,
      directions: Array.from(analysis.signals, (signal) => signal.direction),
    };
    const total = analysis.signals.reduce((sum, signal) => sum + signal.weight, 0);
    const points = analysis.signals.reduce((sum, signal) => sum + (total ? 50 * signal.weight * signal.score / total : 0), 0);
    assert.ok(Math.abs(Math.round((50 + points) * 10) / 10 - analysis.score) < 1e-9, key + ': displayed contributions do not reproduce the score');
    if (!printing) assert.deepEqual(result, expected[key], key + ': engine output changed');
    results[key] = result;
  }
}
if (printing) console.log(JSON.stringify(results, null, 2));
else console.log('PASS: 18 frozen engine/scenario cases; all numerical outputs, verdicts, confidence labels and directions match. Weighted display contributions reproduce all scores.');

