/**
 * Statistics for the engine studies. Plain functions, no dependencies, seeded
 * randomness so every interval is reproducible. Tested in tests/stats.test.mjs.
 */

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pearson correlation; 0 when undefined, matching `pearson` in src/lib/backtest.ts. */
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  const d = Math.sqrt(vx * vy);
  return d === 0 ? 0 : cov / d;
}

/** Ranks starting at 1; tied values share their average rank. */
export function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/**
 * Multiplicity of each of `n` positions in one circular block bootstrap draw:
 * blocks of `blockLen` consecutive positions (wrapping at the end) are drawn
 * with replacement until `n` positions are filled.
 */
export function circularBlockCounts(n, blockLen, random) {
  const counts = new Uint32Array(n);
  let filled = 0;
  while (filled < n) {
    const start = Math.floor(random() * n);
    for (let k = 0; k < blockLen && filled < n; k++, filled++) counts[(start + k) % n]++;
  }
  return counts;
}

/** Multiplicity of each of `n` clusters in one ordinary (iid) bootstrap draw. */
export function iidCounts(n, random) {
  const counts = new Uint32Array(n);
  for (let k = 0; k < n; k++) counts[Math.floor(random() * n)]++;
  return counts;
}

/** Percentile interval and standard error from bootstrap replicates. */
export function interval(replicates, alpha = 0.05) {
  const finite = replicates.filter(Number.isFinite).sort((a, b) => a - b);
  const m = mean(finite);
  const se = Math.sqrt(finite.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, finite.length - 1));
  return { lo: quantile(finite, alpha / 2), hi: quantile(finite, 1 - alpha / 2), se, reps: finite.length };
}

/**
 * The app's pooled correlation for weighted samples: each symbol's Pearson
 * correlation over its samples (each sample counted `weight` times), averaged
 * with weights equal to the symbol's weighted sample count. With all weights 1
 * this equals `pooledCorrelation` in src/lib/backtest.ts.
 *
 * `sym` holds symbol indices, `x` and `y` the paired values, `w` the weight of
 * each sample as an array or a function of the index (0 skips it), `nSym` the
 * number of symbols.
 */
export function pooledCorrelation(sym, x, y, w, nSym) {
  const weights = typeof w === 'function' ? Float64Array.from({ length: sym.length }, (_, i) => w(i)) : w;
  const n = new Float64Array(nSym);
  const sx = new Float64Array(nSym);
  const sy = new Float64Array(nSym);
  const sxx = new Float64Array(nSym);
  const syy = new Float64Array(nSym);
  const sxy = new Float64Array(nSym);
  for (let i = 0; i < sym.length; i++) {
    const k = weights[i];
    if (!k) continue;
    const s = sym[i];
    const xi = x[i];
    const yi = y[i];
    n[s] += k; sx[s] += k * xi; sy[s] += k * yi;
    sxx[s] += k * xi * xi; syy[s] += k * yi * yi; sxy[s] += k * xi * yi;
  }
  let num = 0;
  let den = 0;
  for (let s = 0; s < nSym; s++) {
    if (n[s] === 0) continue;
    let r = 0;
    if (n[s] >= 2) {
      const cov = sxy[s] - (sx[s] * sy[s]) / n[s];
      const vx = sxx[s] - (sx[s] * sx[s]) / n[s];
      const vy = syy[s] - (sy[s] * sy[s]) / n[s];
      // Guard against tiny negative variances from floating-point cancellation.
      const d = Math.sqrt(Math.max(0, vx) * Math.max(0, vy));
      r = d > 1e-12 ? cov / d : 0;
    }
    num += r * n[s];
    den += n[s];
  }
  return den === 0 ? 0 : num / den;
}
