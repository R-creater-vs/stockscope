/**
 * Complete backtest result regression and event-loop responsiveness checks.
 * Synthetic price bars are test fixtures only; they never enter app data.
 * Hashes were frozen from the original synchronous replay before refactoring.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  const file = name.endsWith('.ts') ? name : `${name}.ts`;
  if (modules.has(file)) return modules.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  modules.set(file, mod.exports);
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    console, Date, Math, Number, Map, Set, performance, setImmediate,
  })((relative) => relative.startsWith('.')
    ? load(path.posix.join(path.posix.dirname(file), relative))
    : require(relative), mod, mod.exports);
  return mod.exports;
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const makeBars = (trend, length = 480) => Array.from({ length }, (_, index) => {
  const close = 700 + trend * index + Math.sin(index / 8) * 15 + Math.cos(index / 17) * 8;
  return {
    date: new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10),
    open: close - 1.2, high: close + 4, low: close - 3, close,
    volume: 100000 + (index % 13) * 7000,
  };
});

const { backtestSymbol, backtestSymbolAsync, ENGINE_CONFIGS, STRATEGIES } = load('src/lib/backtest.ts');
const printing = process.argv.includes('--print-fixture');
const expected = printing ? {} : JSON.parse(fs.readFileSync(new URL('./backtest-math-fixture.json', import.meta.url), 'utf8'));
const results = {};

for (const trend of [-0.35, 0, 0.35]) for (const engine of ['short', 'mid', 'long']) {
  const bars = makeBars(trend);
  for (const filtered of [false, true]) {
    const regime = filtered ? Object.fromEntries(bars.map((bar, index) => [bar.date, index % 11 < 7])) : undefined;
    const window = filtered ? { from: bars[240].date, to: bars[430].date } : undefined;
    const args = ['FIXTURE.NS', bars, ENGINE_CONFIGS[engine], regime, STRATEGIES[engine], window];
    const key = `${engine}/${trend}/${filtered ? 'window-and-regime' : 'full'}`;
    const sync = backtestSymbol(...args);
    const digest = hash(sync);
    if (!printing) {
      assert.equal(digest, expected[key], `${key}: synchronous replay changed`);
      assert.equal(hash(await backtestSymbolAsync(...args)), expected[key], `${key}: async replay changed`);
    }
    results[key] = digest;
  }
}

if (printing) {
  console.log(JSON.stringify(results, null, 2));
} else {
  // Replay actual indicator calculations, not a simulated timer-only job. The
  // interval must get a turn before completion; a Promise around a synchronous
  // replay would leave this counter at zero.
  let heartbeats = 0;
  const timer = setInterval(() => { heartbeats++; }, 1);
  try {
    await backtestSymbolAsync('RESPONSIVENESS.NS', makeBars(0.1, 1400));
    assert.ok(heartbeats > 0, 'Historical replay prevented timers and request handling from running');
  } finally {
    clearInterval(timer);
  }
  console.log(`PASS: 18 frozen complete backtest outputs match in sync and async modes; ${heartbeats} timer heartbeats ran during historical replay.`);
}
