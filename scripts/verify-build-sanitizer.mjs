/** Test packaging guards using disposable files, never real runtime identities. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectBuildOutput, prepareBuildOutput } from './prepare-build-output.mjs';

const tempParent = path.resolve(os.tmpdir());
const project = mkdtempSync(path.join(tempParent, 'nivra-packaging-test-'));
const bundle = path.join(project, '.next', 'standalone');
function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
function trace(file, base) {
  write(file, JSON.stringify({ version: 1, files: [
    path.relative(path.dirname(file), path.join(base, '.data', 'auth.json')),
    path.relative(path.dirname(file), path.join(base, '.env.local')),
    path.relative(path.dirname(file), path.join(base, 'public', 'icon.svg')),
  ] }));
}

try {
  write(path.join(project, '.data', 'auth.json'), 'disposable source marker');
  write(path.join(project, '.env.local'), 'disposable environment marker');
  write(path.join(bundle, 'server.js'), '// disposable standalone server');
  write(path.join(bundle, '.data', 'auth.json'), 'disposable copied marker');
  write(path.join(bundle, '.env.local'), 'disposable copied environment');
  write(path.join(bundle, 'public', 'icon.svg'), '<svg/>');
  const routeTrace = path.join(project, '.next', 'server', 'app', 'api', 'test', 'route.js.nft.json');
  const copiedTrace = path.join(bundle, '.next', 'server', 'app', 'api', 'test', 'route.js.nft.json');
  trace(routeTrace, project);
  trace(copiedTrace, bundle);
  trace(path.join(project, '.next', 'next-server.js.nft.json'), project);
  assert.equal(inspectBuildOutput(project).traces.length, 3);
  assert.deepEqual(prepareBuildOutput(project), { removedEntries: 2, removedReferences: 6 });
  assert.ok(existsSync(path.join(project, '.data', 'auth.json')), 'Source runtime data was changed');
  assert.ok(existsSync(path.join(project, '.env.local')), 'Source environment was changed');
  assert.ok(existsSync(path.join(bundle, 'public', 'icon.svg')), 'Legitimate app asset was removed');
  assert.equal(JSON.parse(readFileSync(routeTrace, 'utf8')).files.length, 1);
  assert.deepEqual(prepareBuildOutput(project), { removedEntries: 0, removedReferences: 0 });

  const projectAlias = path.join(project, 'workspace-alias');
  symlinkSync(project, projectAlias, 'junction');
  assert.deepEqual(prepareBuildOutput(projectAlias), { removedEntries: 0, removedReferences: 0 });
  unlinkSync(projectAlias);

  symlinkSync(path.join(project, '.data'), path.join(bundle, '.data'), 'junction');
  assert.equal(prepareBuildOutput(project).removedEntries, 1);
  assert.ok(existsSync(path.join(project, '.data', 'auth.json')), 'Copied symlink removal followed its source');

  const movedBundle = path.join(project, 'copied-server');
  renameSync(bundle, movedBundle);
  symlinkSync(movedBundle, bundle, 'junction');
  assert.throws(() => prepareBuildOutput(project), /symlink/, 'A linked output directory must be rejected');
  unlinkSync(bundle);
  renameSync(movedBundle, bundle);
  console.log('PASS: generated copies and trace references removed; source files and app assets preserved; repeat run clean; project aliases accepted; output symlinks never followed.');
} finally {
  // Delete only the exact disposable directory created above, inside OS temp.
  assert.equal(path.dirname(path.resolve(project)), tempParent);
  assert.ok(path.basename(project).startsWith('nivra-packaging-test-'));
  rmSync(project, { recursive: true, force: true });
}
