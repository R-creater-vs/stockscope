/** HTTP GET smoke check. Start the server with isolated DB/auth/VAPID paths. */
import { writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:3000';
const routes = ['/', '/manifest.webmanifest', '/brand/favicon.svg', '/offline.html', '/api/watchlist', '/api/alerts', '/api/auth/session', '/api/push', '/api/market', '/api/quote?symbol=%5ENSEI', '/api/analyze?q=RELIANCE.NS'];
const checks = await Promise.all(routes.map(async route => {
  const response = await fetch(base + route);
  return { route, status: response.status, contentType: response.headers.get('content-type') };
}));
const html = await (await fetch(base)).text();
const match = html.match(/src="([^"]+\.js[^"]*)"/);
if (!match) throw new Error('No production script found in the page.');
const script = await fetch(base + match[1]);
checks.push({ route: 'first production JavaScript asset', status: script.status, contentType: script.headers.get('content-type') });
const record = { capturedAt: new Date().toISOString(), mode: process.argv[2] ?? 'local server', base, checks };
writeFileSync('docs/server-verification.json', JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
if (checks.some(check => check.status !== 200)) process.exitCode = 1;
