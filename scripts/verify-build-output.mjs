/** Run after a production build, before starting the standalone server. */
import assert from 'node:assert/strict';
import { inspectBuildOutput } from './prepare-build-output.mjs';

const result = inspectBuildOutput();
assert.deepEqual(result.forbidden, [], 'Standalone output contains local runtime data or environment files. Rebuild a clean artifact before deployment.');
assert.equal(result.traces.length, 0, 'Build traces still reference local runtime data or environment files. Run the postbuild packaging step.');
console.log('PASS: standalone server exists; no local .data directory or .env files are packaged or referenced in build traces.');
