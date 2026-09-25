/**
 * Mobile search interaction checks against a local server with an isolated DB.
 * Real Yahoo responses supply report fixtures. Delays/errors are explicitly
 * simulated at the browser transport boundary; they are not live timings.
 * Run: node scripts/verify-search-browser.mjs [http://localhost:3000]
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Use a local server with an isolated verification database.');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chromePath)) throw new Error('Set CHROME_PATH to a local Chrome executable.');
const port = 9335;
const output = path.resolve('docs/search-browser-verification.json');
mkdirSync(path.dirname(output), { recursive: true });
const results = [];
const errors = [];
const fixtures = {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let ws;
let serial = 0;
let handleEvent = () => {};
let browserVersion;
const pending = new Map();

function save(failure) {
  writeFileSync(output, JSON.stringify({
    capturedAt: new Date().toISOString(), base, browser: browserVersion,
    viewport: { width: 390, height: 844 },
    provenance: Object.fromEntries(Object.entries(fixtures).map(([symbol, data]) => [symbol, {
      generatedAt: data.generatedAt, sourceDate: data.bars?.at(-1)?.date, price: data.company.quote.price,
    }])),
    notes: 'Delayed and failed requests are simulated in Chrome DevTools. Successful report bodies are actual local API/Yahoo responses; no financial figures are invented. Live local API calls can use the 60-second server cache. Check durations include navigation and interaction, not only provider latency; this is desktop Chrome at a mobile viewport, not a physical-phone benchmark.',
    results, errors, ...(failure ? { failure: String(failure) } : {}),
  }, null, 2));
}

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 45_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

try {
  for (const symbol of ['IRFC.NS', 'TCS.NS']) {
    const response = await fetch(`${base}/api/analyze?q=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(32_000) });
    const data = await response.json();
    assert.equal(response.status, 200, `${symbol}: ${data.error ?? 'could not load actual report fixture'}`);
    fixtures[symbol] = data;
  }
  browser = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve('.data/nivra-search-browser-review')}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let endpoint;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; }
    catch { await pause(200); }
  }
  if (!endpoint) throw new Error('Chrome did not start.');
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (request) {
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      Promise.resolve(handleEvent(message)).catch(error => errors.push(String(error)));
    }
  };
  browserVersion = (await send('Browser.getVersion')).product;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  };
  async function until(expression, timeout = 35_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function waitFor(predicate, timeout = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const value = predicate(); if (value) return value; await pause(50); }
    throw new Error('Timed out waiting for an intercepted request.');
  }
  const checks = async (name, mode, run) => {
    const started = Date.now();
    const detail = await run();
    results.push({ name, mode, passed: true, durationMs: Date.now() - started, ...detail });
    save(); console.log('PASS ' + name);
  };
  async function reset() {
    await cdp('Page.navigate', { url: base + '/?view=watchlist' });
    await until(`document.readyState === 'complete' && !!document.querySelector('[role="combobox"]') && !!document.querySelector('.page-heading h1')`);
  }
  async function typeQuery(query) {
    await evaluate(`(() => { const box=document.querySelector('#workspace-search'); if(box.hidden) document.querySelector('button[aria-label="Search another company"]').click(); })()`);
    await until(`!document.querySelector('#workspace-search').hidden`);
    await evaluate(`(()=>{const input=document.querySelector('[role="combobox"]');input.focus();input.select();})()`);
    await cdp('Input.insertText', { text: query });
  }
  const submit = () => evaluate(`document.querySelector('.stock-search button[type="submit"]').click()`);
  const reportIs = symbol => `document.querySelector('#report-region h1')?.textContent === ${JSON.stringify(fixtures[symbol].company.profile.name)}`;
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  // Keep transport interception on this page target; the offline worker is
  // tested separately by verify-ui.mjs and must not reroute these requests.
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await checks('IRFC opens through the explicit Search button', 'live local API', async () => {
    await reset(); await typeQuery('IRFC'); await submit(); await until(reportIs('IRFC.NS'));
    assert.equal(await evaluate(`document.activeElement === document.querySelector('#report-region h1')`), true);
    return { actualSymbol: 'IRFC.NS' };
  });
  await checks('Company-name search opens the same stock', 'live local API', async () => {
    await reset(); await typeQuery('Indian Railway Finance'); await submit(); await until(reportIs('IRFC.NS'));
  });
  await checks('Keyboard autocomplete selects a company and focuses its report', 'live local API', async () => {
    await reset(); await typeQuery('IRFC'); await until(`document.querySelectorAll('[role="option"]').length > 0`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    assert.ok(await evaluate(`document.querySelector('[role="combobox"]').getAttribute('aria-activedescendant')`));
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until(reportIs('IRFC.NS'));
    assert.equal(await evaluate(`document.querySelectorAll('[role="option"]').length`), 0);
  });

  let mode = 'normal';
  const held = [];
  const intercepted = [];
  handleEvent = async message => {
    if (message.method !== 'Fetch.requestPaused' || message.sessionId !== sessionId) return;
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    const entry = { requestId, path: url.pathname, query: url.searchParams.get('q'), heldAt: Date.now() };
    intercepted.push(entry);
    if ((mode === 'holdReport' && url.pathname === '/api/analyze') || (mode === 'holdSuggestions' && url.pathname === '/api/search')) {
      held.push(entry); return;
    }
    if (mode === 'failSuggestions' && url.pathname === '/api/search') {
      await cdp('Fetch.fulfillRequest', { requestId, responseCode: 503,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ results: [], error: 'Simulated provider outage' })).toString('base64') });
      return;
    }
    await cdp('Fetch.continueRequest', { requestId });
  };
  await cdp('Fetch.enable', { patterns: [
    { urlPattern: '*/api/analyze*', requestStage: 'Request' }, { urlPattern: '*/api/search*', requestStage: 'Request' },
  ] });
  const takeHeld = (pathname, query) => waitFor(() => held.find(entry => entry.path === pathname && (!query || entry.query === query)));
  async function release(entry, body, ignoreCancelled = false) {
    const index = held.indexOf(entry); if (index >= 0) held.splice(index, 1);
    try {
      await cdp('Fetch.fulfillRequest', { requestId: entry.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
      return 'late response delivered to transport';
    } catch (error) {
      if (!ignoreCancelled) throw error;
      return 'Chrome had already cancelled the request';
    }
  }

  await checks('A delayed request shows actual seconds and Cancel prevents a late report', 'simulated 10-second transport hold', async () => {
    mode = 'holdReport'; await reset(); await typeQuery('IRFC'); await submit();
    const request = await takeHeld('/api/analyze', 'IRFC');
    await pause(10_300);
    const elapsed = await evaluate(`document.querySelector('[role="timer"]')?.getAttribute('aria-label')`);
    const seconds = Number.parseInt(elapsed, 10);
    assert.ok(seconds >= 10 && seconds <= 13, `Unexpected elapsed counter: ${elapsed}`);
    assert.ok(await evaluate(`document.body.innerText.includes('Source speed varies')`));
    await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Cancel search').click()`);
    await until(`!document.querySelector('.report-loading') && !location.search.includes('symbol=')`);
    const transport = await release(request, fixtures['IRFC.NS'], true);
    await pause(600);
    assert.equal(await evaluate(`!!document.querySelector('#report-region')`), false);
    return { elapsedLabel: elapsed, transport };
  });

  await checks('A replacement search wins even when the older response arrives afterward', 'simulated overlapping transport requests', async () => {
    mode = 'holdReport'; await reset(); await typeQuery('IRFC'); await submit();
    const old = await takeHeld('/api/analyze', 'IRFC');
    await typeQuery('TCS'); await submit();
    const next = await takeHeld('/api/analyze', 'TCS');
    assert.ok(await evaluate(`document.querySelector('#loading-heading')?.textContent.includes('TCS')`));
    await release(next, fixtures['TCS.NS']); await until(reportIs('TCS.NS'));
    const transport = await release(old, fixtures['IRFC.NS'], true); await pause(500);
    assert.equal(await evaluate(reportIs('TCS.NS')), true);
    return { actualSymbol: 'TCS.NS', lateOldResponse: transport };
  });

  await checks('Client stops at 30 seconds and Retry can open the stock', 'simulated transport that never responds', async () => {
    mode = 'holdReport'; await reset(); await typeQuery('IRFC'); await submit();
    const old = await takeHeld('/api/analyze', 'IRFC');
    const started = Date.now();
    await until(`document.querySelector('[role="alert"]')?.textContent.includes('within 30 seconds')`, 34_000);
    const waitedMs = Date.now() - started;
    assert.ok(waitedMs >= 28_000 && waitedMs <= 33_000, `Unexpected deadline ${waitedMs}`);
    assert.equal(await evaluate(`!!document.querySelector('.report-loading')`), false);
    await release(old, fixtures['IRFC.NS'], true);
    await evaluate(`[...document.querySelectorAll('[role="alert"] button')].find(button=>button.textContent==='Try again').click()`);
    const retry = await takeHeld('/api/analyze', 'IRFC');
    await release(retry, fixtures['IRFC.NS']); await until(reportIs('IRFC.NS'));
    return { observedWaitMs: waitedMs };
  });

  await checks('Late autocomplete results cannot reopen the list after submission', 'simulated late autocomplete response', async () => {
    mode = 'holdSuggestions'; await reset(); await typeQuery('IRFC');
    const request = await takeHeld('/api/search', 'IRFC');
    await submit(); await until(reportIs('IRFC.NS'));
    const transport = await release(request, { results: [{ symbol: 'IRFC.NS', name: fixtures['IRFC.NS'].company.profile.name, exchange: 'NSE' }] }, true);
    await pause(500);
    await evaluate(`document.querySelector('button[aria-label="Search another company"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('[role="option"]').length`), 0);
    assert.equal(await evaluate(`document.querySelector('[role="combobox"]').getAttribute('aria-expanded')`), 'false');
    return { transport };
  });

  await checks('An autocomplete outage says suggestions are unavailable and preserves direct search', 'simulated search-provider 503', async () => {
    mode = 'failSuggestions'; await reset(); await typeQuery('IRFC');
    await until(`document.querySelector('.search-feedback')?.textContent.includes('Suggestions are unavailable')`);
    assert.equal(await evaluate(`document.querySelector('.stock-search button[type="submit"]').disabled`), false);
    await submit(); await until(reportIs('IRFC.NS'));
  });
  mode = 'normal';
  assert.equal(errors.length, 0, errors.join('\n'));
  save();
  console.log(`\n${results.length} mobile search browser checks passed.`);
} catch (error) {
  save(error); throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); }
  browser?.kill();
}
