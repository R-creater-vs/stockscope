/** Run after a production build, before starting the standalone server. */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const bundle = path.resolve('.next/standalone');
assert.ok(existsSync(path.join(bundle, 'server.js')), 'Run npm run build first.');
const entries = readdirSync(bundle);
const forbidden = entries.filter(name => name === '.data' || name.startsWith('.env'));
assert.deepEqual(forbidden, [], 'Standalone output contains local runtime data or environment files. Rebuild a clean artifact before deployment.');
console.log('PASS: standalone server exists; no local .data directory or .env files are packaged.');
