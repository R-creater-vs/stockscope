/** Offline transport/route regressions. Synthetic prices are fixtures, never product data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cases = [];
const quietConsole = { ...console, error() {} };

function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    let file = name.endsWith('.ts') ? name : name + '.ts';
    if (!fs.existsSync(file)) file = path.posix.join(name, 'index.ts');
    if (cache.has(file)) return cache.get(file);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache.set(file, mod.exports);
    const context = {
      console: quietConsole, Date, Math, Number, Error, Map, Set, Promise, AbortController,
      AbortSignal, DOMException, URL, URLSearchParams, Response, process,
      setTimeout, clearTimeout, fetch: globalThis.fetch, ...globals,
    };
    const wrapper = '(function(require,module,exports){' + js + '\n})';
    const execute = globals.native ? vm.runInThisContext(wrapper) : vm.runInNewContext(wrapper, context);
    execute((relative) => {
      if (relative in overrides) return overrides[relative];
      if (relative.startsWith('@/')) return load('src/' + relative.slice(2));
      if (relative.startsWith('.')) return load(path.posix.join(path.posix.dirname(file), relative));
      return require(relative);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

if (process.argv.includes('--live')) {
  const liveLoad = loader({ 'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } } }, { native: true });
  const { GET } = liveLoad('src/app/api/analyze/route');
  for (const query of ['IRFC', 'Indian Railway Finance', 'NIVRAZZZNOTREAL']) {
    const started = performance.now();
    const response = await GET({ nextUrl: new URL('http://localhost/api/analyze?q=' + encodeURIComponent(query)), signal: new AbortController().signal });
    const data = await response.json();
    console.log(JSON.stringify({ query, status: response.status, elapsedMs: Math.round(performance.now() - started), symbol: data.match?.symbol,
      bars: data.bars?.length, sourceDate: data.bars?.at(-1)?.date, dataStatus: data.company?.dataStatus, narrative: data.narrative?.source, error: data.error }));
    assert.equal(response.status, query === 'NIVRAZZZNOTREAL' ? 404 : 200);
  }
  process.exit(0);
}

const rows = Array.from({ length: 400 }, (_, i) => ({
  date: new Date(Date.UTC(2024, 0, i + 1)),
  open: 100 + i / 10, close: 101 + i / 10, high: 103 + i / 10,
  low: 99 + i / 10, volume: 100000 + i * 100,
}));
const calls = [];
const implementations = {};
class MockYahoo {
  constructor(options) { this.options = options; this.lane = options.queue.concurrency === 4 ? 'interactive' : 'background'; }
  chart(...args) { return this.call('chart', ...args); }
  quote(...args) { return this.call('quote', ...args); }
  quoteSummary(...args) { return this.call('quoteSummary', ...args); }
  search(...args) { return this.call('search', ...args); }
  call(method, symbol, options, moduleOptions) {
    calls.push({ method, symbol, lane: this.lane, signal: moduleOptions.fetchOptions.signal });
    return (implementations[method] ?? defaults[method])(symbol, options, moduleOptions);
  }
}
const defaults = {
  chart: async () => ({ quotes: rows }),
  quote: async (symbol) => ({ regularMarketPrice: symbol.endsWith('.BO') ? 100 : 200, longName: symbol, currency: 'INR' }),
  quoteSummary: async () => ({}),
  search: async () => ({ quotes: [] }),
};
const shortTimers = (fn, ms, ...args) => setTimeout(fn, ms === 4_000 ? 30 : ms >= 20_000 ? 1200 : ms >= 5_000 ? 180 : ms, ...args);
const load = loader({
  'yahoo-finance2': MockYahoo,
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
}, {
  setTimeout: shortTimers,
  fetch: async () => { throw new Error('Initial report must not contact Ollama'); },
});
const yahoo = load('src/lib/yahoo');
const analyze = load('src/app/api/analyze/route');
const search = load('src/app/api/search/route');
const { withDeadline, ProviderTimeoutError } = load('src/lib/providerRequest');
const req = (query, extras = '', signal = new AbortController().signal) => ({
  nextUrl: new URL('http://localhost/api/analyze?q=' + encodeURIComponent(query) + extras), signal,
});
const never = () => new Promise(() => {});
const check = async (name, run) => { await run(); cases.push(name); console.log('PASS ' + name); };

await check('Deadline rejects a queued operation and aborts its transport signal', async () => {
  let signal;
  await assert.rejects(withDeadline((value) => { signal = value; return never(); }, 20), ProviderTimeoutError);
  assert.equal(signal.aborted, true);
});

await check('Cancelling one request leaves a separate request usable', async () => {
  const cancelled = new AbortController();
  let started = false;
  cancelled.abort();
  await assert.rejects(withDeadline(async () => { started = true; }, 20, cancelled.signal), { name: 'AbortError' });
  assert.equal(started, false);
  assert.equal(await withDeadline(async () => 'ready', 20), 'ready');
});

await check('IRFC and its company name resolve without a provider lookup', async () => {
  calls.length = 0;
  assert.equal((await yahoo.resolveSymbol('IRFC')).symbol, 'IRFC.NS');
  assert.equal((await yahoo.resolveSymbol('Indian Railway Finance')).symbol, 'IRFC.NS');
  assert.equal((await yahoo.searchIndian('irfc'))[0].symbol, 'IRFC.NS');
  assert.equal(calls.length, 0);
});

await check('Names outside the directory retain Yahoo search', async () => {
  implementations.search = async () => ({ quotes: [{ symbol: 'EXAMPLE.NS', shortname: 'Example company', quoteType: 'EQUITY' }] });
  assert.equal((await yahoo.resolveSymbol('Example company')).symbol, 'EXAMPLE.NS');
  assert.equal(calls.at(-1).method, 'search');
  delete implementations.search;
});

await check('Price history and company fetch start together in the foreground lane', async () => {
  calls.length = 0;
  let finishChart;
  implementations.chart = () => new Promise((resolve) => { finishChart = resolve; });
  const pending = analyze.GET(req('IRFC'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(calls.some((call) => call.method === 'quote'));
  assert.ok(calls.some((call) => call.method === 'quoteSummary'));
  assert.ok(calls.every((call) => call.lane === 'interactive'));
  finishChart({ quotes: rows });
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).narrative.source, 'template');
  delete implementations.chart;
});

await check('A completed report warms the canonical-symbol cache', async () => {
  calls.length = 0;
  const response = await analyze.GET(req('IRFC.NS'));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
});

await check('Background chart work uses a separate provider lane', async () => {
  calls.length = 0;
  await yahoo.fetchBars('TCS.NS', 1);
  assert.equal(calls[0].lane, 'background');
});

await check('Missing symbol produces 404 rather than a permanently loading report', async () => {
  implementations.quote = async () => undefined;
  const response = await analyze.GET(req('ZZZNOTREAL'));
  assert.equal(response.status, 404);
  delete implementations.quote;
});

await check('A stalled optional summary aborts and clearly marks partial company data', async () => {
  let summarySignal;
  implementations.quoteSummary = (_symbol, _options, options) => { summarySignal = options.fetchOptions.signal; return never(); };
  const company = await yahoo.fetchCompany('TCS.NS');
  assert.equal(summarySignal.aborted, true);
  assert.equal(company.dataStatus.fundamentals, 'unavailable');
  assert.equal(company.fundamentals.returnOnEquity, null);
  assert.equal(company.earnings.nextDate, null);
  delete implementations.quoteSummary;
});

await check('A provider timeout produces 504 and is not cached as empty history', async () => {
  implementations.chart = never;
  const failed = await analyze.GET(req('TCS'));
  assert.equal(failed.status, 504);
  delete implementations.chart;
  const retry = await analyze.GET(req('TCS'));
  assert.equal(retry.status, 200);
});

await check('Request cancellation reaches provider signals and returns 499', async () => {
  implementations.chart = never;
  const controller = new AbortController();
  const pending = analyze.GET(req('INFY', '', controller.signal));
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  assert.equal((await pending).status, 499);
  const lastChart = calls.filter((call) => call.method === 'chart').at(-1);
  assert.equal(lastChart.signal.aborted, true);
  delete implementations.chart;
});

await check('BSE fallback uses the NSE quote and discloses the switched listing', async () => {
  implementations.chart = async (symbol) => ({ quotes: symbol.endsWith('.BO') ? rows.slice(0, 5) : rows });
  const response = await analyze.GET(req('RELIANCE.BO'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.match.switchedFrom, 'RELIANCE.BO');
  assert.equal(data.company.profile.symbol, 'RELIANCE.NS');
  assert.equal(data.company.quote.price, 200);
  delete implementations.chart;
});

await check('Search transport failures are distinguishable from zero matches', async () => {
  implementations.search = async () => { throw new Error('Network unavailable'); };
  const response = await search.GET(req('Unlisted imaginary company'));
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
  implementations.search = never;
  assert.equal((await search.GET(req('Another imaginary company'))).status, 504);
  delete implementations.search;
});

await check('The route deadline also bounds a provider that never settles', async () => {
  const isolated = loader({
    '@/lib/providers': { resolveSymbol: never },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  }, { setTimeout: (fn, ms, ...args) => setTimeout(fn, ms === 25_000 ? 20 : ms, ...args) });
  const response = await isolated('src/app/api/analyze/route').GET(req('IRFC'));
  assert.equal(response.status, 504);
});

console.log(`\n${cases.length} search and loading regressions passed.`);
