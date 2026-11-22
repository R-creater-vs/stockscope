/**
 * Loads the app's pure TypeScript modules into a plain Node script without a
 * build step, so tests and offline studies exercise the exact source the app
 * runs. Each file is transpiled (types erased, nothing type-checked; that is
 * `npm run typecheck`'s job) and evaluated as CommonJS in this realm, so arrays
 * and objects it returns compare normally with node:assert.
 *
 * Only for modules without Next.js or browser dependencies (the analysis,
 * indicator, pattern and backtest code in src/lib).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const cache = new Map();

function resolveSource(spec, fromDir) {
  const base = spec.startsWith('@/') ? path.join(ROOT, 'src', spec.slice(2)) : path.resolve(fromDir, spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`load-ts: cannot resolve "${spec}" from ${fromDir}`);
}

/** Load a module by repo-relative path, e.g. loadTs('src/lib/candlePatterns'). */
export function loadTs(spec, fromDir = ROOT) {
  const file = resolveSource(spec, fromDir);
  const hit = cache.get(file);
  if (hit) return hit.exports;

  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;

  const mod = { exports: {} };
  cache.set(file, mod);
  const dir = path.dirname(file);
  const localRequire = (dep) =>
    dep.startsWith('.') || dep.startsWith('@/') ? loadTs(dep, dir) : requireFromRoot(dep);
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}
