/** Live stock-report/history checks against a local production server using an isolated DB. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Use a local server with an isolated verification database.');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chromePath)) throw new Error('Set CHROME_PATH to a local Chrome executable.');
const port = 9336;
const output = path.resolve('docs/history-browser-verification.json');
mkdirSync(path.dirname(output), { recursive: true });
const results = [];
const errors = [];
const requests = [];
const reports = [];
const history = [];
const responsePaths = new Map();
const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let browserVersion;
let ws;
let serial = 0;
let sessionId;

function save(failure) {
  writeFileSync(output, JSON.stringify({
    capturedAt: new Date().toISOString(), base, browser: browserVersion,
    viewport: { width: 390, height: 844 },
    provenance: reports.map(({ data }) => ({ symbol: data.company.profile.symbol, generatedAt: data.generatedAt, sourceDate: data.bars.at(-1).date, price: data.company.quote.price })),
    notes: 'All requests use actual local production API/Yahoo responses. No interception, fixture prices or invented figures. A desktop Chrome mobile viewport is not a physical phone. Timings may include provider or server caches; pending-before-search means the most recent observed history response was pending, not a claim about exact CPU overlap.',
    results, errors, ...(failure ? { failure: String(failure) } : {}),
  }, null, 2));
}
function send(method, params = {}, targetSession) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 40_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, ...(targetSession ? { sessionId: targetSession } : {}) }));
  });
}
const cdp = (method, params) => send(method, params, sessionId);
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}
async function until(expression, timeout = 35_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await pause(100); }
  throw new Error(`Timed out: ${expression}`);
}
async function check(name, run) {
  const started = Date.now();
  const detail = await run();
  results.push({ name, passed: true, durationMs: Date.now() - started, ...detail });
  save(); console.log(`PASS ${name}`);
}
async function search(query) {
  await evaluate(`(() => { const box=document.querySelector('#workspace-search'); if(box.hidden) document.querySelector('button[aria-label="Search another company"]').click(); })()`);
  await until(`!document.querySelector('#workspace-search').hidden`);
  await evaluate(`(()=>{const input=document.querySelector('[role="combobox"]');input.focus();input.select();})()`);
  await cdp('Input.insertText', { text: query });
  await evaluate(`document.querySelector('.stock-search button[type="submit"]').click()`);
}
async function waitForBody(collection, predicate, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { const found = collection.find(predicate); if (found) return found; await pause(50); }
  throw new Error('Actual API response body was not captured.');
}

try {
  browser = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve('.data/nivra-history-browser-review')}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Network.requestWillBeSent') requests.push({ url: message.params.request.url, at: Date.now() });
    if (message.method === 'Network.responseReceived') {
      const { response, requestId } = message.params;
      if (/\/api\/(analyze|backtest)\?/.test(response.url)) responsePaths.set(requestId, { url: response.url, at: Date.now(), status: response.status });
    }
    if (message.method === 'Network.loadingFinished' && responsePaths.has(message.params.requestId)) {
      const metadata = responsePaths.get(message.params.requestId);
      void cdp('Network.getResponseBody', { requestId: message.params.requestId }).then(body => {
        const parsed = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body);
        const entry = { ...metadata, data: parsed };
        (metadata.url.includes('/api/analyze?') ? reports : history).push(entry);
      }).catch(error => errors.push(`Could not read response: ${error}`));
    }
  };
  browserVersion = (await send('Browser.getVersion')).product;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: `${base}/?view=watchlist` });
  await until(`document.readyState==='complete' && !!document.querySelector('[role="combobox"]')`);
  await search('IRFC');
  await until(`!!document.querySelector('#report-summary select') && document.querySelector('#report-region h1')?.textContent.includes('Railway')`);
  const actual = (await waitForBody(reports, row => row.data.company?.profile.symbol === 'IRFC.NS')).data;

  await check('All timeframe scores, confidence and summaries match the actual IRFC response', async () => {
    const compared = [];
    for (const timeframe of ['short', 'mid', 'long']) {
      await evaluate(`(() => {const control=document.querySelector('#report-summary select');control.value=${JSON.stringify(timeframe)};control.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`document.querySelector('#report-summary .report-summary')?.textContent === ${JSON.stringify(actual.timeframes[timeframe].summary)}`);
      const displayed = await evaluate(`(()=>{const metrics=[...document.querySelectorAll('[aria-label="Setup assessment"] .tnum')].map(node=>parseFloat(node.textContent));return {score:metrics[0],confidence:metrics[1],overflow:document.documentElement.scrollWidth>innerWidth};})()`);
      assert.equal(displayed.score, actual.timeframes[timeframe].score);
      assert.equal(displayed.confidence, actual.timeframes[timeframe].confidence);
      assert.equal(displayed.overflow, false);
      compared.push({ timeframe, ...displayed });
    }
    return { compared };
  });
  await check('Report section navigation focuses its target without starting a history job', async () => {
    for (const section of ['summary', 'price', 'signals', 'risk', 'history', 'company']) {
      await evaluate(`document.querySelectorAll('nav[aria-label="Stock report sections"] button')[${['summary', 'price', 'signals', 'risk', 'history', 'company'].indexOf(section)}].click()`);
      assert.equal(await evaluate('document.activeElement.id'), `report-${section}`);
    }
    assert.equal(requests.filter(row => row.url.includes('/api/backtest?')).length, 0);
  });
  await check('Prominent Run history check focuses the history section and starts an actual job', async () => {
    await evaluate(`[...document.querySelectorAll('#report-summary button')].find(button=>button.textContent==='Run history check').click()`);
    assert.equal(await evaluate('document.activeElement.id'), 'report-history');
    await until(`document.querySelector('#report-history')?.innerText.includes('Running history check') || document.querySelector('#report-history')?.innerText.includes('historical expectancy')`);
    const first = await waitForBody(history, row => row.url.includes('q=IRFC.NS'), 30_000);
    assert.equal(first.status, 200, first.data.error);
    assert.ok(['pending', 'ready'].includes(first.data.status));
    if (first.data.status === 'pending') await pause(1100);
    const elapsedText = await evaluate(`document.querySelector('#report-history .tnum.text-2xl')?.textContent ?? null`);
    return { initialStatus: first.data.status, elapsedText, note: first.data.status === 'ready' ? 'The server already had a result; no artificial pending state was inserted.' : 'The API returned pending; elapsed text is observed browser waiting time.' };
  });
  await check('A different stock can be searched after starting the history check', async () => {
    const statusBeforeSearch = history.at(-1)?.data.status;
    const pendingOnScreen = await evaluate(`document.querySelector('#report-history')?.innerText.includes('Running history check')`);
    const started = Date.now();
    await search('TCS');
    await until(`document.querySelector('#report-region h1')?.textContent.includes('Tata Consultancy')`);
    const tcs = (await waitForBody(reports, row => row.data.company?.profile.symbol === 'TCS.NS')).data;
    return { actualSymbol: tcs.company.profile.symbol, statusBeforeSearch, pendingOnScreen, searchElapsedMs: Date.now() - started,
      concurrency: pendingOnScreen && statusBeforeSearch === 'pending' ? 'Search began after a pending history response while the history waiting state remained visible.' : 'History completed too quickly to observe overlapping search; this run verifies navigation only.' };
  });
  await check('Returning to IRFC shows actual historical trades, costs and the model limitation', async () => {
    await search('IRFC');
    await until(`document.querySelector('#report-region h1')?.textContent.includes('Railway')`);
    await evaluate(`[...document.querySelectorAll('#report-summary button')].find(button=>button.textContent==='Run history check').click()`);
    await until(`document.querySelector('#report-history')?.innerText.includes('historical expectancy')`, 180_000);
    const completed = await waitForBody(history, row => row.data.status === 'ready' && row.data.result?.symbol === 'IRFC.NS');
    const value = completed.data.result;
    const shown = await evaluate(`document.querySelector('#report-history').innerText`);
    assert.ok(shown.includes(`${value.stats.trades} trades`), shown);
    assert.ok(shown.includes(`net of ${value.config.costPct}% round-trip cost`));
    assert.ok(shown.includes('no demonstrated stable edge'));
    assert.ok(shown.includes('forward-return windows overlap'));
    assert.equal(await evaluate(`!![...document.querySelectorAll('#report-history button')].find(button=>button.textContent==='Stop waiting')`), false);
    return { symbol: value.symbol, from: value.from, to: value.to, trades: value.stats.trades, samples: value.signal.samples, roundTripCostPct: value.config.costPct, expectancyR: value.stats.expectancyR, resultGeneratedAt: completed.data.generatedAt };
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  save();
  console.log(`${results.length} live mobile-viewport history browser checks passed.`);
} catch (error) {
  save(error); throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); }
  browser?.kill();
}
