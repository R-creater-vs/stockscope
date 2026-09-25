/** Failed history jobs must stay failed until the user explicitly retries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let fetchCount = 0;
let shouldFail = true;
let persisted = null;
const match = { symbol: 'TEST.NS', name: 'Job lifecycle test', exchange: 'NSE' };
// Mocks isolate job orchestration from Yahoo, disk persistence and financial math.
// Financial-result equivalence is checked by verify-backtest-responsiveness.mjs.
const imports = {
  './providers': {
    async fetchBars(symbol) {
      fetchCount++;
      if (shouldFail) throw new Error('Source unavailable');
      return { symbol, bars: new Array(240) };
    },
  },
  './backtest': {
    DEFAULT_CONFIG: { warmup: 210 },
    async backtestSymbolAsync(symbol) { return { symbol, testFixture: true }; },
  },
  './db': {
    loadBacktestCache() { return null; },
    saveBacktestCache(symbol, data) { persisted = { symbol, payload: JSON.parse(data) }; },
  },
};

const compiled = ts.transpileModule(fs.readFileSync('src/lib/backtestJobs.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, Date, Map, Error })(
  (name) => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, mod, mod.exports,
);
const { getOrStartBacktest } = mod.exports;
const settle = () => new Promise((resolve) => setImmediate(resolve));

assert.equal(getOrStartBacktest(match.symbol, match).status, 'pending');
assert.equal(getOrStartBacktest(match.symbol, match).status, 'pending');
assert.equal(fetchCount, 1, 'Concurrent polling duplicated the history fetch');
await settle();
for (let poll = 0; poll < 3; poll++) {
  const failed = getOrStartBacktest(match.symbol, match);
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /Source unavailable/);
}
assert.equal(fetchCount, 1, 'Ordinary polling silently restarted a failed job');

shouldFail = false;
assert.equal(getOrStartBacktest(match.symbol, match, true).status, 'pending');
assert.equal(getOrStartBacktest(match.symbol, match, true).status, 'pending');
assert.equal(fetchCount, 2, 'Retry either failed to start or duplicated the running job');
await settle();
const ready = getOrStartBacktest(match.symbol, match);
assert.equal(ready.status, 'ready');
assert.equal(ready.payload.match.symbol, match.symbol);
assert.equal(persisted.symbol, match.symbol);
assert.equal(getOrStartBacktest(match.symbol, match, true).status, 'ready');
assert.equal(fetchCount, 2, 'Retry bypassed a completed result');
console.log('PASS: pending deduplication, visible failed status, explicit retry, persistence, and ready cache reuse.');
