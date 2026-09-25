import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real component with controlled network responses and time.
// No Yahoo requests or expensive historical jobs are started by this check.
const source = ts.transpileModule(readFileSync('src/components/BacktestPanel.tsx', 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(autoRun = false) {
  const slots = [];
  const timers = new Map();
  const requests = [];
  let cursor = 0;
  let clock = 1_000_000;
  let nextTimer = 1;
  let dirty = true;
  let tree;
  let pendingEffects = [];
  const schedule = (fn, delay, repeat = false) => {
    const id = nextTimer++;
    timers.set(id, { fn, due: clock + delay, repeat, delay });
    return id;
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const prior = slots[index];
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
        pendingEffects.push(() => {
          prior?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const exports = {};
  const context = {
    exports,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '@/lib/format') return { pct: String };
      return new Proxy({}, { get: (_, key) => String(key) });
    },
    Date: class extends Date { static now() { return clock; } },
    AbortController,
    setTimeout: (fn, delay) => schedule(fn, delay),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearInterval: (id) => timers.delete(id),
    fetch: (url, { signal }) => new Promise((resolve, reject) => {
      requests.push({ url, signal, respond: (json, ok = true) => resolve({ ok, json: async () => json }), reject });
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
  };
  vm.runInNewContext(source, context);
  async function flush() {
    for (let i = 0; i < 20; i++) {
      if (dirty) {
        dirty = false;
        cursor = 0;
        pendingEffects = [];
        tree = exports.default({ query: 'IRFC.NS', autoRun });
        for (const effect of pendingEffects) effect();
      }
      await Promise.resolve();
    }
  }
  const text = (node) => node == null || typeof node === 'boolean' ? ''
    : typeof node !== 'object' ? String(node)
      : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  const button = (label, node = tree) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && text(node) === label) return node;
    const children = Array.isArray(node) ? node : [node.props?.children];
    for (const child of children) { const found = button(label, child); if (found) return found; }
    return null;
  };
  return {
    requests, timers, flush, text: () => text(tree),
    async click(label) { const target = button(label); assert.ok(target, `Button exists: ${label}`); target.props.onClick(); await flush(); },
    async advance(ms) {
      const until = clock + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > until) break;
        const [id, timer] = next;
        clock = timer.due;
        if (timer.repeat) timer.due += timer.delay; else timers.delete(id);
        timer.fn();
        await flush();
      }
      clock = until;
      await flush();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const idle = harness();
await idle.flush();
assert.equal(idle.requests.length, 0, 'Opening a panel does not start a history job');
await idle.click('Run history check');
assert.equal(idle.requests.length, 1);
assert.match(idle.requests[0].url, /q=IRFC.NS/);
assert.doesNotMatch(idle.requests[0].url, /retry=/, 'Ordinary polling never automatically restarts failed jobs');
await idle.advance(3000);
assert.match(idle.text(), /3s elapsed/, 'Elapsed seconds come from real waiting time');
await idle.click('Stop waiting');
assert.ok(idle.requests[0].signal.aborted, 'Stopping aborts the outstanding status request');
assert.match(idle.text(), /may continue on the server/);
await idle.advance(20_000);
assert.equal(idle.requests.length, 1, 'Stopping also removes future polls');
await idle.click('Check for result');
assert.equal(idle.requests.length, 2, 'Resuming checks for the server result');
idle.requests[1].respond({ status: 'error', error: 'History is not available.' }, false);
await idle.flush();
assert.match(idle.text(), /History is not available/);
await idle.click('Retry history check');
assert.equal(idle.requests.length, 3, 'Error state can retry');
assert.match(idle.requests[2].url, /&retry=1$/, 'Explicit retry asks the server to restart a failed job');
idle.requests[2].respond({ status: 'pending', startedAt: 1_000_000 });
await idle.flush();
await idle.advance(2500);
assert.equal(idle.requests.length, 4);
assert.doesNotMatch(idle.requests[3].url, /retry=/, 'Subsequent retry polls only request status');
idle.unmount();
assert.ok(idle.requests[3].signal.aborted, 'Unmounting cancels an outstanding request');
assert.equal(idle.timers.size, 0, 'Unmounting releases every timer');

const pending = harness(true);
await pending.flush();
pending.requests[0].respond({ status: 'pending', startedAt: 1_000_000 });
await pending.flush();
await pending.advance(2500);
assert.equal(pending.requests.length, 2, 'Pending jobs poll again');
await pending.advance(180_000);
assert.match(pending.text(), /taking longer than 3 minutes/, 'Long jobs reach a finite timeout');
assert.equal(pending.timers.size, 0, 'Timeout releases polling and elapsed timers');
assert.ok(pending.requests.at(-1).signal.aborted);
await pending.click('Retry history check');
assert.match(pending.text(), /0s elapsed/, 'Retry starts a fresh waiting timer');
pending.requests.at(-1).reject(new Error('Offline'));
await pending.flush();
assert.match(pending.text(), /Check your connection/);
pending.unmount();

const ready = harness(true);
await ready.flush();
ready.requests[0].respond({ status: 'ready', result: {
  from: '2021-01-29', to: '2026-09-24', symbol: 'IRFC.NS', buyHoldReturnPct: 12,
  stats: { trades: 10, winRate: 40, expectancyR: -0.1, profitFactor: 0.8, totalReturnPct: -2, maxDrawdownPct: 9, avgHoldDays: 8 },
  equityCurve: [], signal: { buckets: [], horizon: 10, correlation: 0.01, samples: 500 }, config: { costPct: 0.2, holdMaxDays: 20 },
} });
await ready.flush();
assert.match(ready.text(), /10 trades on IRFC/);
assert.match(ready.text(), /no demonstrated stable edge/);
assert.equal(ready.timers.size, 0, 'Completed results stop every timer');
ready.unmount();

console.log('History flow passed: explicit start, elapsed time, pending polling, stop/resume, errors, retry, finite timeout, unmount cleanup and completed results.');
