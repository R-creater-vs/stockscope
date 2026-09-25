/** Browser review against a local server with an ISOLATED verification DB.
 * Uses installed Chrome + its DevTools protocol and the existing axe-core dependency.
 * Run: node scripts/verify-ui.mjs [http://localhost:3000]
 * Outputs actual-source screenshots and a machine-readable verification record.
 * No production fixtures or invented financial values are inserted into the app.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const base = process.argv[2] ?? 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Verification is restricted to a local server with an isolated database.');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chromePath)) throw new Error('Set CHROME_PATH to a local Chrome executable.');
const port = 9334;
const output = path.resolve('docs/screenshots');
mkdirSync(output, { recursive: true });
const browser = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.resolve('.data/nivra-browser-review')}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const pending = new Map();
const errors = [];
let id = 0;
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 60_000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const results = [];
try {
  let endpoint;
  for (let n = 0; n < 50; n++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; } catch { await pause(200); }
  }
  if (!endpoint) throw new Error('Chrome did not start.');
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  async function until(expression, maxMs = 90_000) {
    const begin = Date.now();
    while (Date.now() - begin < maxMs) { if (await evaluate(expression)) return; await pause(250); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function nav(url, ready) {
    await cdp('Page.navigate', { url: base + url });
    await until(`document.readyState === 'complete' && ${ready}`);
    await evaluate('document.fonts.ready');
    await pause(300);
  }
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__nivraMetrics = { lcp: null, cls: 0, longTasks: 0, longTaskOver50Ms: 0 }; for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) { try { new PerformanceObserver(list => { for (const entry of list.getEntries()) { if (type === 'largest-contentful-paint') window.__nivraMetrics.lcp = entry.startTime; if (type === 'layout-shift' && !entry.hadRecentInput) window.__nivraMetrics.cls += entry.value; if (type === 'longtask') { window.__nivraMetrics.longTasks++; window.__nivraMetrics.longTaskOver50Ms += Math.max(0, entry.duration - 50); } } }).observe({ type, buffered: true }); } catch {} }` });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await nav('/', `!!document.querySelector('.sector-cell')`);
  // Seed only the isolated test identity with an actual Yahoo symbol, no push subscriptions.
  await evaluate(`(async () => { const r = await fetch('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'RELIANCE.NS',name:'Reliance Industries'})}); if(!r.ok) throw new Error('Could not save test watchlist'); const old = await (await fetch('/api/alerts')).json(); for(const a of old.alerts) await fetch('/api/alerts?id='+encodeURIComponent(a.id),{method:'DELETE'}); const a = await fetch('/api/alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'RELIANCE.NS',name:'Reliance Industries',kind:'score_above',threshold:99,timeframe:'short'})}); if(!a.ok) throw new Error('Could not save test alert'); })()`);
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const views = [
    ['overview', '/', `!!document.querySelector('.sector-cell') && document.querySelector('.regime-panel')?.getAttribute('aria-busy') === 'false'`],
    ['discover', '/?view=discover', `document.querySelector('.view-content')?.offsetParent !== null && !!document.querySelector('.view-content .stock-row')`],
    ['report', '/?symbol=RELIANCE.NS', `!!document.querySelector('#report-region h1') && !!document.querySelector('.recharts-surface')`],
    ['watchlist', '/?view=watchlist', `document.querySelector('.page-heading h1')?.textContent.includes('perspective') && document.body.innerText.includes('score changes') && document.body.innerText.includes('First reading')`],
    ['alerts', '/?view=alerts', `document.querySelector('.page-heading h1')?.textContent.includes('waiting') && document.body.innerText.includes('99')`],
    ['evidence', '/?view=strategy', `!!document.querySelector('[aria-label="Recorded strategy validation"]')`],
  ];
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: label === 'mobile' });
    for (const [name, url, ready] of views) {
      await nav(url, ready);
      await evaluate(axeSource);
      const accessibility = await evaluate(`axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r => ({violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({html:n.html,target:n.target,summary:n.failureSummary}))})),passes:r.passes.length,incomplete:r.incomplete.map(v=>v.id)}))`);
      const layout = await evaluate(`({width:innerWidth,documentWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,h1s:[...document.querySelectorAll('h1')].filter(e=>e.offsetParent!==null).length,smallTargets:[...document.querySelectorAll('button,a,input,select,summary')].filter(e=>e.offsetParent!==null && getComputedStyle(e).visibility!=='hidden').filter(e=>e.getBoundingClientRect().height<44 || e.getBoundingClientRect().width<44).map(e=>({text:e.innerText?.slice(0,60)||e.getAttribute('aria-label'),h:Math.round(e.getBoundingClientRect().height),w:Math.round(e.getBoundingClientRect().width)}))})`);
      const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(path.join(output, `${label}-${name}.png`), Buffer.from(screenshot.data, 'base64'));
      const viewportShot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(path.join(output, `${label}-${name}-viewport.png`), Buffer.from(viewportShot.data, 'base64'));
      results.push({ viewport: label, view: name, layout, accessibility });
      writeFileSync(path.resolve('docs/browser-verification.json'), JSON.stringify({ capturedAt: new Date().toISOString(), base, results, errors }, null, 2));
      console.log(`${label}/${name}: overflow=${layout.overflow}, axe=${accessibility.violations.length}, smallTargets=${layout.smallTargets.length}`);
    }
  }
  for (const width of [320, 375, 768]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await nav('/?symbol=RELIANCE.NS', `!!document.querySelector('#report-region h1') && !!document.querySelector('.recharts-surface')`);
    results.push({ viewport: width, view: 'report', overflow: await evaluate('document.documentElement.scrollWidth > innerWidth + 1') });
  }
  const interactions = [];
  const interactionResult = { interactions };
  results.push(interactionResult);
  const check = async (name, expression) => { const passed = Boolean(await evaluate(expression)); interactions.push({ name, passed }); if (!passed) throw new Error(`Interaction failed: ${name}`); };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav('/?view=discover', `document.querySelector('.view-content')?.offsetParent !== null && !!document.querySelector('.view-content .stock-row')`);
  await evaluate(`document.querySelector('.filter-search input').focus()`);
  await cdp('Input.insertText', { text: 'RELIANCE' });
  await until(`document.querySelectorAll('.view-content .stock-row').length === 1`);
  await check('Discover filter narrows actual scan', `document.querySelector('.view-content .stock-identity').innerText.includes('Reliance')`);
  await evaluate(`document.querySelector('[role="combobox"]').focus()`);
  await cdp('Input.insertText', { text: 'RELIANCE' });
  await until(`document.querySelectorAll('[role="option"]').length > 0`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await check('Search has keyboard active descendant', `!!document.querySelector('[role="combobox"]').getAttribute('aria-activedescendant')`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(`!!document.querySelector('#report-region h1')`);
  await check('Keyboard search opens report and focuses heading', `document.activeElement === document.querySelector('#report-region h1')`);
  await evaluate(`document.querySelector('button[aria-label="Search another company"]').click()`);
  await check('Report search disclosure stays reachable', `document.querySelector('[role="combobox"]').offsetParent !== null && document.querySelector('button[aria-label="Search another company"]').getAttribute('aria-expanded') === 'true'`);
  await evaluate(`document.querySelector('button[aria-label="Search another company"]').click()`);
  await check('Signal evidence uses the selected engine score', `document.querySelector('[aria-label="Weighted signal evidence"] header strong').innerText.startsWith(Number(document.querySelector('[aria-label="Setup assessment"] .tnum').firstChild.textContent).toFixed(1))`);
  await evaluate(`document.querySelector('button[aria-label^="Remove Reliance"]').click()`);
  await until(`!!document.querySelector('button[aria-label^="Add Reliance"]')`);
  await nav('/?symbol=RELIANCE.NS', `!!document.querySelector('#report-region h1') && !!document.querySelector('button[aria-label^="Add Reliance"]')`);
  await check('Watchlist removal persists through reload', `!!document.querySelector('button[aria-label^="Add Reliance"]')`);
  await evaluate(`document.querySelector('button[aria-label^="Add Reliance"]').click()`);
  await until(`!!document.querySelector('button[aria-label^="Remove Reliance"]')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Price alerts')).click()`);
  await until(`!!document.querySelector('select[id$="-kind"]')`);
  await evaluate(`(()=>{ const field=document.querySelector('input[id$="-threshold"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'98');field.dispatchEvent(new Event('input',{bubbles:true})); const tf=document.querySelector('select[id$="-timeframe"]');tf.value='mid';tf.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await until(`document.body.innerText.includes('Mid-term technical score is at or above 98/100')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Save alert rule').click()`);
  await until(`document.body.innerText.includes('Rule saved for')`);
  await check('Alert form saves actual threshold and timeframe', `(async()=>{const d=await(await fetch('/api/alerts')).json();return d.alerts.some(a=>a.threshold===98&&a.timeframe==='mid');})()`);
  await evaluate(`(()=>{const f=document.querySelector('input[id$="-threshold"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,'20');f.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await check('Saved alert uses stored threshold after form edits', `document.body.innerText.includes('Score at or above 98')`);
  await check('Reduced motion disables CSS animation', `[...document.querySelectorAll('*')].every(e=>getComputedStyle(e).animationName==='none')`);
  await cdp('Network.enable');
  await nav('/?view=discover', `document.querySelector('.view-content')?.offsetParent !== null && !!document.querySelector('.view-content .stock-row')`);
  await cdp('Network.setBlockedURLs', { urls: ['*api/analyze*'] });
  await evaluate(`document.querySelector('.view-content .stock-identity').click()`);
  await until(`!!document.querySelector('[role="alert"]')`);
  await check('Failed report offers a visible error', `document.querySelector('[role="alert"]').innerText.includes('Could not reach')`);
  await evaluate('history.back()');
  await until(`!location.search.includes('symbol=')`);
  await check('Browser Back clears failed report error', `![...document.querySelectorAll('[role="alert"]')].some(e=>e.innerText.includes('Could not reach'))`);
  await cdp('Network.setBlockedURLs', { urls: [] });
  await nav('/?view=watchlist', `document.body.innerText.includes('score changes')`);
  await evaluate(`document.querySelector('button[aria-label^="Remove Reliance"]').click()`);
  await until(`document.body.innerText.includes('Give your research a place to return to')`);
  await check('Empty watchlist offers Discover', `[...document.querySelectorAll('button')].some(b=>b.innerText.includes('Discover stocks'))`);
  const emptyShot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(output, 'mobile-watchlist-empty.png'), Buffer.from(emptyShot.data, 'base64'));
  await evaluate(`fetch('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:'RELIANCE.NS',name:'Reliance Industries'})})`);
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  const localPerformance = [];
  for (const [view, url, ready] of [views[0], views[2]]) {
    await nav(url, ready);
    localPerformance.push({ view, cache: 'browser cache disabled; server and source caches warm; no CPU or network throttle', ...await evaluate(`({observedAt:performance.now(),...window.__nivraMetrics,navigation:performance.getEntriesByType('navigation').map(n=>({domContentLoaded:n.domContentLoadedEventEnd,responseEnd:n.responseEnd,load:n.loadEventEnd})),scriptTransferBytes:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((s,r)=>s+r.transferSize,0),scriptDecodedBytes:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').reduce((s,r)=>s+r.decodedBodySize,0)})`) });
  }
  interactionResult.localPerformance = localPerformance;
  await evaluate(`navigator.serviceWorker.ready`);
  // A page-only offline override leaves the worker's own fetch online in Chrome.
  // Apply the same network failure to both targets to exercise true offline navigation.
  const { targetInfos } = await send('Target.getTargets');
  const worker = targetInfos.find(t => t.type === 'service_worker' && t.url === base + '/sw.js');
  if (!worker) throw new Error('The installed offline service worker was not found.');
  const { sessionId: workerSession } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  await send('Network.enable', {}, workerSession);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, workerSession);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, workerSession);
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await until(`document.body.innerText.includes('You’re offline')`);
  await check('Loaded app reports offline status', `document.body.innerText.includes('Previously loaded research may be out of date')`);
  await nav('/', `document.querySelector('h1')?.innerText.includes('moment without')`);
  await check('Offline navigation shows explicit fallback', `document.body.innerText.includes('No market figures are available')`);
  const offlineShot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(output, 'mobile-offline.png'), Buffer.from(offlineShot.data, 'base64'));
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, workerSession);
  writeFileSync(path.resolve('docs/browser-verification.json'), JSON.stringify({ capturedAt: new Date().toISOString(), base, browser: (await send('Browser.getVersion')).product, results, errors }, null, 2));
  if (results.some(r => r.layout?.overflow || r.layout?.smallTargets.length || r.overflow || r.accessibility?.violations.length) || errors.length) process.exitCode = 1;
} catch (error) {
  writeFileSync(path.resolve('docs/browser-verification.json'), JSON.stringify({ capturedAt: new Date().toISOString(), base, results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await send('Browser.close').catch(() => {}); ws.close(); }
  browser.kill();
}
