/**
 * Keep runtime identities and local data out of generated deployment artifacts.
 * Next 16.2.11's Webpack exclusion matching uses backslashes on Windows, which
 * picomatch interprets as escapes. Keep the config exclusions for other builds,
 * and enforce the same rule here without modifying Next or runtime file paths.
 */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const forbiddenName = (name) => name === '.data' || name.startsWith('.env');

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `Refusing to change a path outside generated output: ${target}`);
}

function assertNotSymlink(target) {
  assert.equal(realpathSync(target), path.resolve(target), `Refusing to follow a generated-output symlink: ${target}`);
}

/** Return filenames only; never read the contents of runtime data or env files. */
export function inspectBuildOutput(projectDir = process.cwd()) {
  // Termux may reach its home through /data/data or /data/user/0 aliases.
  // Canonicalize the project itself, then reject links inside generated output.
  const project = realpathSync(path.resolve(projectDir));
  const output = path.join(project, '.next');
  const bundle = path.join(output, 'standalone');
  assert.ok(existsSync(path.join(bundle, 'server.js')), 'Run a production build first.');
  assertNotSymlink(output);
  assertNotSymlink(bundle);
  const forbidden = readdirSync(bundle).filter(forbiddenName).map((name) => path.join(bundle, name));
  const traces = [];

  function inspectTrace(file, base) {
    assertNotSymlink(file);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(data.files), `Invalid trace manifest: ${file}`);
    const files = data.files.filter((reference) => {
      const resolved = path.resolve(path.dirname(file), reference);
      const relative = path.relative(base, resolved);
      return !forbiddenName(relative.split(path.sep)[0]);
    });
    if (files.length !== data.files.length) traces.push({ file, data: { ...data, files }, removed: data.files.length - files.length });
  }

  function walk(dir, base) {
    if (!existsSync(dir)) return;
    assertNotSymlink(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      // Generated links are never followed to source files outside the bundle.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(file, base);
      else if (entry.name.endsWith('.nft.json')) inspectTrace(file, base);
    }
  }

  for (const [dir, base] of [[output, project], [path.join(bundle, '.next'), bundle]]) {
    if (!existsSync(dir)) continue;
    assertNotSymlink(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.nft.json')) inspectTrace(path.join(dir, entry.name), base);
    }
    walk(path.join(dir, 'server'), base);
  }
  return { output, bundle, forbidden, traces };
}

export function prepareBuildOutput(projectDir = process.cwd()) {
  const state = inspectBuildOutput(projectDir);
  for (const trace of state.traces) {
    assertInside(state.output, trace.file);
    assertNotSymlink(trace.file);
    writeFileSync(trace.file, JSON.stringify(trace.data));
  }
  for (const target of state.forbidden) {
    assertInside(state.bundle, target);
    // unlink a copied symlink itself; never recurse through its destination.
    if (lstatSync(target).isSymbolicLink()) unlinkSync(target);
    else rmSync(target, { recursive: true, force: true });
  }
  const clean = inspectBuildOutput(projectDir);
  assert.equal(clean.forbidden.length, 0, 'Local runtime files remain in standalone output.');
  assert.equal(clean.traces.length, 0, 'Local runtime references remain in build traces.');
  return { removedEntries: state.forbidden.length, removedReferences: state.traces.reduce((total, trace) => total + trace.removed, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = prepareBuildOutput();
  console.log(`Prepared standalone output: removed ${result.removedEntries} local runtime entries and ${result.removedReferences} trace references.`);
}
