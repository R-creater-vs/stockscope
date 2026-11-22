/**
 * Engine study: the app's own backtest for one engine, plus confidence
 * intervals, a shuffled-price baseline, per-input analysis and measured data
 * limits.
 *
 * Methods were fixed in advance in docs/research/mid-engine-preregistration.md
 * (mid engine) and extended to the short engine and the long-term proxy in
 * docs/research/short-long-remeasurement-plan.md. Engines, trade rules and
 * pooled metrics come from the app's source (src/lib/backtest.ts and the engine
 * files), loaded directly, and the script checks that its own samples
 * reproduce the app's pooled correlation exactly.
 *
 * Usage (no dev server needed; network access to Yahoo is, on the first run):
 *   node scripts/research/engine-study.mjs --engine mid --window recent --null 3
 *   node scripts/research/engine-study.mjs --engine short --window 2019-2022 --null 3
 * Options: --engine short|mid|long (default mid), --window recent|2019-2022,
 * --null N (shuffled-price runs, seeds 1..N), --reps N (bootstrap replicates),
 * --refresh (refetch instead of using the .data/research/ cache),
 * --keep-placeholder-bars (the bar filter fixed in the plans; reproduces the
 * results published on 22 Nov 2026), --tag NAME (suffix for the output file).
 * Writes docs/research/results/<engine>-<window>[-<tag>].json and prints a summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadTs, ROOT } from '../load-ts.mjs';
import * as S from './stats.mjs';

/* ------------------------------------------------------------------ setup */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DAY = 86_400_000;
const minusDays = (iso, days) => new Date(Date.parse(iso) - days * DAY).toISOString().slice(0, 10);

/** Fixed in the pre-registration. The windowed fetch mirrors spanFor() in src/lib/backtestStudy.ts. */
const WINDOWS = {
  recent: { key: 'recent', label: 'Recent (trailing 3-year fetch)', span: { years: 3 }, window: null },
  '2019-2022': {
    key: '2019-2022',
    label: '2019–2022',
    span: { from: minusDays('2019-01-01', 500), to: '2022-12-31' },
    window: { from: '2019-01-01', to: '2022-12-31' },
  },
};
const W = WINDOWS[option('window', 'recent')];
if (!W) throw new Error(`--window must be one of: ${Object.keys(WINDOWS).join(', ')}`);

const REPS = Number(option('reps', 2000));
const SEED = 20261122;
const MIN_STOCKS_PER_DATE = 10;
const EXTREME_MOVE = 0.2;

const { backtestSymbol, aggregate, ENGINE_CONFIGS, longTrendStrategy } = loadTs('src/lib/backtest');
const { analyzeMidTerm } = loadTs('src/lib/midterm');
const { analyzeSwing } = loadTs('src/lib/swing');
const { scoreSignals } = loadTs('src/lib/timeframes');
const { UNIVERSE, MARKET_INDEX } = loadTs('src/lib/universe');
const { ema } = loadTs('src/lib/indicators');

/** The swing engine's score from its inputs, with the same operations as analyzeSwing(). */
function swingScore(signals) {
  const total = signals.reduce((s, x) => s + x.weight, 0);
  const raw = signals.reduce((s, x) => s + x.weight * ((x.score + 1) / 2), 0);
  const score = total === 0 ? 50 : (raw / total) * 100;
  return Math.round(score * 10) / 10;
}
const keep = (signals) => signals.map((x) => ({ name: x.name, score: x.score, weight: x.weight }));

/**
 * Each engine's decision exactly as STRATEGIES in src/lib/backtest.ts builds it,
 * plus its inputs where it has separate ones, and the function that turns
 * inputs back into its score (for the drop-one ablation).
 */
const ENGINES = {
  short: {
    label: 'Short-term (swing) engine',
    source: 'src/lib/swing.ts',
    scorer: swingScore,
    run: (bars) => {
      const a = analyzeSwing(bars);
      return { score: a.score, verdict: a.verdict, stop: a.plan?.stopLoss ?? null, target: a.plan?.target1 ?? null, signals: keep(a.signals) };
    },
  },
  mid: {
    label: 'Mid-term engine',
    source: 'src/lib/midterm.ts',
    scorer: scoreSignals,
    run: (bars) => {
      const tf = analyzeMidTerm(bars);
      return { score: tf.score, verdict: tf.verdict, stop: tf.tradePlan?.stopLoss ?? null, target: tf.tradePlan?.target1 ?? null, signals: keep(tf.signals) };
    },
  },
  long: {
    label: 'Long-term price-trend proxy',
    source: 'longTrendStrategy in src/lib/backtest.ts',
    scorer: null,
    run: (bars) => ({ ...longTrendStrategy(bars), signals: null }),
  },
};
const ENGINE = option('engine', 'mid');
const E = ENGINES[ENGINE];
if (!E) throw new Error(`--engine must be one of: ${Object.keys(ENGINES).join(', ')}`);
const config = ENGINE_CONFIGS[ENGINE];
const H = config.signalHorizon;
const BLOCK = 2 * H; // sessions: twice the forward horizon
const decision = (d) => ({ score: d.score, verdict: d.verdict, stop: d.stop, target: d.target });
const codeVersion = (() => {
  try {
    const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const dirty = execSync('git status --porcelain -- src scripts', { cwd: ROOT }).toString().trim() ? ' (with uncommitted changes)' : '';
    return head + dirty;
  } catch {
    return 'unknown';
  }
})();

/* ------------------------------------------------------------------- data */

const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const yfModule = await import(pathToFileURL(requireFromRoot.resolve('yahoo-finance2')).href);
const YahooFinance = yfModule.default?.default ?? yfModule.default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

/** Same options as fetchBarsFor() in src/lib/yahoo.ts. */
function chartOptions(span) {
  if (span.from) return { period1: new Date(span.from), period2: new Date(span.to), interval: '1d' };
  const from = new Date();
  from.setFullYear(from.getFullYear() - span.years);
  return { period1: from, interval: '1d' };
}

/** Same row filter as toBars() in src/lib/yahoo.ts; also counts what it drops. */
function toBars(rows) {
  const kept = rows.filter((q) => q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null);
  return {
    raw: rows.length,
    dropped: rows.length - kept.length,
    bars: kept.map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume,
    })),
  };
}

async function fetchSeries(symbol, span) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const chart = await yf.chart(symbol, chartOptions(span));
      return toBars(chart.quotes ?? []);
    } catch (err) {
      const salvaged = err?.result?.quotes;
      if (Array.isArray(salvaged)) return toBars(salvaged);
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) ** 2));
    }
  }
  return { error: String(lastError?.message ?? lastError) };
}

async function loadData() {
  const cacheDir = path.join(ROOT, '.data', 'research');
  const cacheFile = path.join(cacheDir, `bars-${W.key}.json`);
  if (!flag('refresh') && fs.existsSync(cacheFile)) {
    console.log(`Using cached bars from ${path.relative(ROOT, cacheFile)} (pass --refresh to refetch).`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  console.log(`Fetching ${UNIVERSE.length} stocks + ${MARKET_INDEX.symbol} from Yahoo…`);
  const symbols = [MARKET_INDEX.symbol, ...UNIVERSE.map((u) => u.symbol)];
  const series = {};
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      series[symbol] = await fetchSeries(symbol, W.span);
    }
  }));
  const data = { fetchedAt: new Date().toISOString(), span: W.span, series };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

/* ------------------------------------------------------------------ study */

const data = await loadData();

// The app drops Yahoo placeholder bars from 22 Nov 2026 (src/lib/barQuality.ts).
// Results published before that fix were run with --keep-placeholder-bars,
// which reproduces the completeness-only filter fixed in the plans.
const { dropPlaceholderBars } = loadTs('src/lib/barQuality');
const KEEP_PLACEHOLDERS = flag('keep-placeholder-bars');
let placeholderBarsDropped = 0;
if (!KEEP_PLACEHOLDERS) {
  for (const [symbol, entry] of Object.entries(data.series)) {
    if (!entry?.bars) continue;
    const kept = dropPlaceholderBars(entry.bars);
    if (symbol !== MARKET_INDEX.symbol) placeholderBarsDropped += entry.bars.length - kept.length;
    entry.bars = kept;
  }
}
const nifty = data.series[MARKET_INDEX.symbol];
if (!nifty?.bars?.length) throw new Error('Nifty 50 series unavailable; cannot build the market regime.');

// Market regime exactly as buildMarketRegime() in src/lib/backtestStudy.ts.
const niftyE50 = ema(nifty.bars.map((b) => b.close), 50);
const regime = {};
nifty.bars.forEach((b, i) => { if (niftyE50[i] !== null) regime[b.date] = b.close > niftyE50[i]; });

const coverage = { attempted: UNIVERSE.length, fetchFailed: [], tooShort: [], studied: 0, listedDuringFetch: [] };
const quality = { rawRows: 0, droppedRows: 0, keptBars: 0, zeroVolumeBars: 0, duplicateDates: 0, missingSessions: 0, extremeMoves: [] };
const niftyDates = nifty.bars.map((b) => b.date);
const fetchStart = nifty.bars[0].date;

const results = [];
const samples = []; // { s, date, y, score, signals, regimeOn }
let inputNames = null;
const symbolsStudied = [];

for (const u of UNIVERSE) {
  const entry = data.series[u.symbol];
  if (!entry || entry.error || !entry.bars) { coverage.fetchFailed.push(u.symbol); continue; }
  const bars = entry.bars;

  // Data quality, measured on every fetched series.
  quality.rawRows += entry.raw;
  quality.droppedRows += entry.dropped;
  quality.keptBars += bars.length;
  const seen = new Set();
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (seen.has(b.date)) quality.duplicateDates++;
    seen.add(b.date);
    if (b.volume === 0) quality.zeroVolumeBars++;
    if (i > 0) {
      const move = b.close / bars[i - 1].close - 1;
      if (Math.abs(move) > EXTREME_MOVE) quality.extremeMoves.push({ symbol: u.symbol, date: b.date, movePct: +(move * 100).toFixed(1) });
    }
  }
  if (bars.length) {
    const first = bars[0].date;
    const last = bars.at(-1).date;
    quality.missingSessions += niftyDates.filter((d) => d >= first && d <= last && !seen.has(d)).length;
    if (Date.parse(first) - Date.parse(fetchStart) > 10 * DAY) coverage.listedDuringFetch.push({ symbol: u.symbol, firstBar: first });
  }

  if (bars.length < config.warmup + 30) { coverage.tooShort.push(u.symbol); continue; }

  // One engine pass per stock, through the app's own replay. The wrapper returns
  // the same Decision as the app's strategy and records each day's inputs.
  const captured = new Map();
  const strategy = (slice) => {
    const d = E.run(slice);
    captured.set(slice.length - 1, { score: d.score, signals: d.signals });
    return decision(d);
  };
  const bt = backtestSymbol(u.symbol, bars, config, regime, strategy, W.window ?? undefined);
  results.push(bt);
  const s = symbolsStudied.length;
  symbolsStudied.push(u.symbol);

  for (const [i, c] of captured) {
    if (i >= bars.length - H) continue; // same sample rule as replayBacktest()
    if (c.signals) inputNames ??= c.signals.map((x) => x.name);
    samples.push({
      s,
      date: bars[i].date,
      y: ((bars[i + H].close - bars[i].close) / bars[i].close) * 100,
      score: c.score,
      signals: c.signals,
      regimeOn: regime[bars[i].date],
    });
  }
}
coverage.studied = results.length;

/* ------------------------------------------------- arrays for the bootstrap */

const app = aggregate(results);
const N = samples.length;
const nSym = symbolsStudied.length;
const calendar = [...new Set(samples.map((x) => x.date))].sort();
const dateIndex = new Map(calendar.map((d, i) => [d, i]));
const D = calendar.length;

const sym = Int32Array.from(samples, (x) => x.s);
const dIdx = Int32Array.from(samples, (x) => dateIndex.get(x.date));
const y = Float64Array.from(samples, (x) => x.y);
const score = Float64Array.from(samples, (x) => x.score);
const regimeOn = Uint8Array.from(samples, (x) => (x.regimeOn === true ? 1 : 0));
const regimeKnown = Uint8Array.from(samples, (x) => (x.regimeOn === undefined ? 0 : 1));

// Sanity: the engine's reported score must equal its scorer applied to its
// inputs, and our samples must reproduce the app's pooled correlation.
if (E.scorer) {
  for (const x of samples) {
    if (Math.abs(E.scorer(x.signals) - x.score) > 1e-9) throw new Error(`score mismatch for sample on ${x.date}`);
  }
}
const ones = new Float64Array(N).fill(1);
const ourPooled = S.pooledCorrelation(sym, score, y, ones, nSym);
if (Math.abs(ourPooled - app.signal.correlation) > 1e-9) {
  throw new Error(`Samples do not reproduce the app: ${ourPooled} vs ${app.signal.correlation}`);
}

// Per-input value (NaN when the engine excluded it) and drop-one score.
inputNames ??= [];
const inputValue = inputNames.map((name) => Float64Array.from(samples, (x) => x.signals.find((g) => g.name === name)?.score ?? NaN));
const dropOne = inputNames.map((name) => Float64Array.from(samples, (x) => E.scorer(x.signals.filter((g) => g.name !== name))));
const inputCoverage = inputValue.map((arr) => arr.filter(Number.isFinite).length / N);

// Per-date groups for the cross-sectional statistics.
const byDate = Array.from({ length: D }, () => []);
for (let i = 0; i < N; i++) byDate[dIdx[i]].push(i);

function dailyIC(values) {
  const ic = new Float64Array(D).fill(NaN);
  for (let d = 0; d < D; d++) {
    const idx = byDate[d].filter((i) => Number.isFinite(values[i]));
    if (idx.length < MIN_STOCKS_PER_DATE) continue;
    ic[d] = S.spearman(idx.map((i) => values[i]), idx.map((i) => y[i]));
  }
  return ic;
}
const icScore = dailyIC(score);
const icInputs = inputValue.map(dailyIC);

// Bucket sums per date for the top-minus-bottom spread (app bucket edges).
const top = new Float64Array(D * 2);
const bottom = new Float64Array(D * 2);
for (let i = 0; i < N; i++) {
  const d = dIdx[i];
  if (score[i] >= 72) { top[2 * d] += y[i]; top[2 * d + 1]++; }
  if (score[i] < 40) { bottom[2 * d] += y[i]; bottom[2 * d + 1]++; }
}

function weightedMean(series, counts) {
  let num = 0;
  let den = 0;
  for (let d = 0; d < series.length; d++) {
    if (!counts[d] || !Number.isFinite(series[d])) continue;
    num += counts[d] * series[d];
    den += counts[d];
  }
  return den ? num / den : NaN;
}
function spread(counts) {
  let ts = 0, tn = 0, bs = 0, bn = 0;
  for (let d = 0; d < D; d++) {
    const c = counts[d];
    if (!c) continue;
    ts += c * top[2 * d]; tn += c * top[2 * d + 1];
    bs += c * bottom[2 * d]; bn += c * bottom[2 * d + 1];
  }
  return tn && bn ? ts / tn - bs / bn : NaN;
}

/* -------------------------------------------------------------- bootstrap */

const allOnes = new Uint32Array(D).fill(1);
const sampleWeights = (counts, mask) => {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = mask && !mask(i) ? 0 : counts[dIdx[i]];
  return w;
};
const isOn = (i) => regimeKnown[i] && regimeOn[i];
const isOff = (i) => regimeKnown[i] && !regimeOn[i];

function statsFor(counts) {
  const w = sampleWeights(counts);
  const full = S.pooledCorrelation(sym, score, y, w, nSym);
  return {
    pooled: full,
    meanIC: weightedMean(icScore, counts),
    spread: spread(counts),
    regimeOn: S.pooledCorrelation(sym, score, y, sampleWeights(counts, isOn), nSym),
    regimeOff: S.pooledCorrelation(sym, score, y, sampleWeights(counts, isOff), nSym),
    inputIC: icInputs.map((ic) => weightedMean(ic, counts)),
    dropDelta: dropOne.map((x) => full - S.pooledCorrelation(sym, x, y, w, nSym)),
  };
}

console.log(`Bootstrapping ${REPS} replicates over ${D} dates (${N.toLocaleString('en-IN')} samples, ${nSym} stocks)…`);
const point = statsFor(allOnes);
const random = S.rng(SEED);
const reps = [];
for (let r = 0; r < REPS; r++) reps.push(statsFor(S.circularBlockCounts(D, BLOCK, random)));
const ciOf = (get) => S.interval(reps.map(get));

// Trades: resample calendar months of entry.
const trades = results.flatMap((r) => r.trades);
const months = [...new Set(trades.map((t) => t.entryDate.slice(0, 7)))].sort();
const monthIndex = new Map(months.map((m, i) => [m, i]));
const perMonth = months.map(() => ({ n: 0, sumR: 0, wins: 0, gw: 0, gl: 0 }));
for (const t of trades) {
  const m = perMonth[monthIndex.get(t.entryDate.slice(0, 7))];
  m.n++; m.sumR += t.r;
  if (t.returnPct > 0) { m.wins++; m.gw += t.returnPct; } else m.gl += -t.returnPct;
}
function tradeStats(counts) {
  let n = 0, sumR = 0, wins = 0, gw = 0, gl = 0;
  perMonth.forEach((m, i) => { const c = counts[i]; n += c * m.n; sumR += c * m.sumR; wins += c * m.wins; gw += c * m.gw; gl += c * m.gl; });
  return { expectancyR: n ? sumR / n : NaN, profitFactor: gl ? gw / gl : NaN, winRate: n ? (wins / n) * 100 : NaN };
}
const tradeRandom = S.rng(SEED + 1);
const tradeReps = Array.from({ length: REPS }, () => tradeStats(S.iidCounts(months.length, tradeRandom)));
const tradeCI = (k) => S.interval(tradeReps.map((x) => x[k]));

// Non-overlapping check: every H-th trading date, for each of the H offsets.
const nonOverlapping = Array.from({ length: H }, (_, k) =>
  S.pooledCorrelation(sym, score, y, Float64Array.from(dIdx, (d) => (d % H === k ? 1 : 0)), nSym));

/* ------------------------------------------------- null calibration (amend. 1) */

function meanDailyICOf(list) {
  const groups = new Map();
  for (const x of list) {
    const g = groups.get(x.date) ?? [];
    g.push(x);
    groups.set(x.date, g);
  }
  const ics = [];
  for (const g of groups.values()) {
    if (g.length >= MIN_STOCKS_PER_DATE) ics.push(S.spearman(g.map((x) => x.score), g.map((x) => x.y)));
  }
  return S.mean(ics);
}

const NULL_REPS = Number(option('null', 0));
const nullRuns = [];
for (let seed = 1; seed <= NULL_REPS; seed++) {
  console.log(`Null calibration ${seed}/${NULL_REPS}: shuffling each stock's days and re-running the engine…`);
  const random = S.rng(seed);
  const res = [];
  const list = [];
  symbolsStudied.forEach((symbol, s) => {
    const bars = S.shuffleDays(data.series[symbol].bars, random);
    const scores = new Map();
    const strategy = (slice) => {
      const d = E.run(slice);
      scores.set(slice.length - 1, d.score);
      return decision(d);
    };
    res.push(backtestSymbol(symbol, bars, config, undefined, strategy, W.window ?? undefined));
    for (const [i, sc] of scores) {
      if (i < bars.length - H) list.push({ s, date: bars[i].date, score: sc, y: ((bars[i + H].close - bars[i].close) / bars[i].close) * 100 });
    }
  });
  const agg = aggregate(res);
  nullRuns.push({
    seed,
    pooledCorrelation: agg.signal.correlation,
    meanDailyIC: meanDailyICOf(list),
    expectancyR: agg.trade.expectancyR,
    profitFactor: agg.trade.profitFactor,
    trades: agg.trade.trades,
  });
}

/* -------------------------------------------------------- survivorship proxy */

const firstDate = calendar[0];
const lastDate = calendar.at(-1);
/** Close of the last bar on or before `date`; undefined if the series starts later (not yet listed). */
const closeAsOf = (bars, date) => {
  let close;
  for (const b of bars) {
    if (b.date > date) break;
    close = b.close;
  }
  return close;
};
const niftyReturn = (closeAsOf(nifty.bars, lastDate) / closeAsOf(nifty.bars, firstDate) - 1) * 100;
const stockReturns = [];
for (const symbol of symbolsStudied) {
  const bars = data.series[symbol].bars;
  const a = closeAsOf(bars, firstDate);
  const b = closeAsOf(bars, lastDate);
  if (a && b) stockReturns.push((b / a - 1) * 100);
}
const sortedReturns = [...stockReturns].sort((p, q) => p - q);

/* ------------------------------------------------------------------ output */

const round = (x, d = 4) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const withCI = (est, ci) => ({ estimate: round(est), lo: round(ci.lo), hi: round(ci.hi), se: round(ci.se) });

const PLAN = ENGINE === 'mid' ? 'docs/research/mid-engine-preregistration.md' : 'docs/research/short-long-remeasurement-plan.md';
const out = {
  engine: ENGINE,
  engineLabel: E.label,
  engineSource: E.source,
  window: W.label,
  windowKey: W.key,
  plan: PLAN,
  codeVersion,
  barFilter: KEEP_PLACEHOLDERS
    ? 'complete rows only (the app before 22 Nov 2026; the filter fixed in the plans)'
    : 'complete rows, placeholder bars dropped (the app from 22 Nov 2026)',
  dataFetchedAt: data.fetchedAt,
  fetchSpan: W.span,
  decisionWindow: { from: firstDate, to: lastDate, tradingDates: D },
  method: { horizonSessions: H, bootstrap: { type: 'circular block over trading dates', blockSessions: BLOCK, replicates: REPS, seed: SEED }, tradeBootstrap: 'iid over calendar months of entry' },
  sanity: { samplesReproduceAppCorrelation: true, ourPooled: round(ourPooled, 6), appPooled: round(app.signal.correlation, 6) },
  primary: {
    pooledCorrelation: withCI(point.pooled, ciOf((r) => r.pooled)),
    expectancyR: withCI(app.trade.expectancyR, tradeCI('expectancyR')),
    profitFactor: withCI(app.trade.profitFactor, tradeCI('profitFactor')),
    winRatePct: withCI(app.trade.winRate, tradeCI('winRate')),
    trades: app.trade.trades,
    samples: N,
    stocks: nSym,
    avgBuyHoldPct: round(app.trade.avgBuyHoldPct, 2),
    /** Each stock's trades compounded one position at a time, averaged across stocks (same window as buy-and-hold). */
    avgStrategyReturnPct: round(app.trade.avgSymbolTotalReturnPct, 2),
    regimeFiltered: (() => {
      const f = results.filter((r) => r.filtered).map((r) => ({ ...r, trades: r.filtered.trades, stats: r.filtered.stats }));
      const agg = f.length ? aggregate(f) : null;
      return agg ? { trades: agg.trade.trades, expectancyR: round(agg.trade.expectancyR), profitFactor: round(agg.trade.profitFactor) } : null;
    })(),
  },
  buckets: app.signal.buckets.map((b) => ({ label: b.label, n: b.n, avgForwardReturnPct: round(b.avgForwardReturnPct, 3), winRatePct: round(b.winRate, 1) })),
  secondary: {
    meanDailyIC: withCI(point.meanIC, ciOf((r) => r.meanIC)),
    topMinusBottomSpreadPct: withCI(point.spread, ciOf((r) => r.spread)),
    regime: {
      niftyAbove50EMA: { ...withCI(point.regimeOn, ciOf((r) => r.regimeOn)), samples: samples.filter((x) => x.regimeOn === true).length },
      niftyBelow50EMA: { ...withCI(point.regimeOff, ciOf((r) => r.regimeOff)), samples: samples.filter((x) => x.regimeOn === false).length },
    },
    nonOverlapping: { offsets: H, mean: round(S.mean(nonOverlapping)), min: round(Math.min(...nonOverlapping)), max: round(Math.max(...nonOverlapping)) },
    inputs: inputNames.map((name, k) => ({
      name,
      weight: samples[0].signals.find((g) => g.name === name)?.weight ?? null,
      coverage: round(inputCoverage[k], 4),
      meanDailyIC: withCI(point.inputIC[k], ciOf((r) => r.inputIC[k])),
      dropOneDelta: withCI(point.dropDelta[k], ciOf((r) => r.dropDelta[k])),
    })),
  },
  nullCalibration: nullRuns.length
    ? {
        method: 'each stock\'s days shuffled in time (return, open gap and high/low shape kept per day); same engine, rules and statistics',
        plan: ENGINE === 'mid' ? `${PLAN}#amendment-1-22-november-2026-after-the-recent-window-run-before-the-20192022-run` : PLAN,
        runs: nullRuns.map((x) => ({ seed: x.seed, pooledCorrelation: round(x.pooledCorrelation), meanDailyIC: round(x.meanDailyIC), expectancyR: round(x.expectancyR), profitFactor: round(x.profitFactor), trades: x.trades })),
        meanPooledCorrelation: round(S.mean(nullRuns.map((x) => x.pooledCorrelation))),
        meanDailyIC: round(S.mean(nullRuns.map((x) => x.meanDailyIC))),
        realMinusNullPooled: round(point.pooled - S.mean(nullRuns.map((x) => x.pooledCorrelation))),
      }
    : null,
  limits: {
    coverage: {
      attempted: coverage.attempted,
      studied: coverage.studied,
      fetchFailed: coverage.fetchFailed,
      tooShort: coverage.tooShort,
      listedDuringFetch: coverage.listedDuringFetch,
    },
    survivorship: {
      from: firstDate,
      to: lastDate,
      stocksWithBothDates: stockReturns.length,
      equalWeightStockReturnPct: round(S.mean(stockReturns), 2),
      medianStockReturnPct: round(S.quantile(sortedReturns, 0.5), 2),
      nifty50PriceReturnPct: round(niftyReturn, 2),
      shareOfStocksBeatingNiftyPct: round((stockReturns.filter((r) => r > niftyReturn).length / stockReturns.length) * 100, 1),
    },
    dataQuality: {
      ...quality,
      placeholderBarsDropped: KEEP_PLACEHOLDERS ? null : placeholderBarsDropped,
      extremeMoveThresholdPct: EXTREME_MOVE * 100,
      extremeMoveCount: quality.extremeMoves.length,
    },
  },
};

const outDir = path.join(ROOT, 'docs', 'research', 'results');
fs.mkdirSync(outDir, { recursive: true });
const TAG = option('tag', '');
const outFile = path.join(outDir, `${ENGINE}-${W.key}${TAG ? `-${TAG}` : ''}.json`);
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);

/* ---------------------------------------------------------------- summary */

const fmt = (o, d = 4) => `${o.estimate?.toFixed(d)}  [95% CI ${o.lo?.toFixed(d)} to ${o.hi?.toFixed(d)}]`;
console.log(`\n=== ${E.label.toUpperCase()} · ${W.label} · ${H}-session horizon · decisions ${firstDate} → ${lastDate} ===`);
console.log(`stocks ${nSym}/${coverage.attempted}  samples ${N.toLocaleString('en-IN')}  trades ${app.trade.trades}`);
console.log(`pooled correlation  ${fmt(out.primary.pooledCorrelation)}   (app: ${app.signal.correlation.toFixed(4)})`);
console.log(`net expectancy (R)  ${fmt(out.primary.expectancyR, 3)}`);
console.log(`profit factor       ${fmt(out.primary.profitFactor, 2)}`);
console.log(`per stock          strategy ${out.primary.avgStrategyReturnPct}% vs buy-and-hold ${out.primary.avgBuyHoldPct}% (average across stocks)`);
console.log(`mean daily IC       ${fmt(out.secondary.meanDailyIC)}`);
console.log(`72+ minus <40 (%)   ${fmt(out.secondary.topMinusBottomSpreadPct, 3)}`);
console.log(`regime on / off     ${out.secondary.regime.niftyAbove50EMA.estimate} / ${out.secondary.regime.niftyBelow50EMA.estimate}`);
console.log(`non-overlapping     mean ${out.secondary.nonOverlapping.mean}  range ${out.secondary.nonOverlapping.min} to ${out.secondary.nonOverlapping.max}`);
for (const inp of out.secondary.inputs) console.log(`  ${inp.name.padEnd(28)} IC ${fmt(inp.meanDailyIC)}   drop-one Δ ${fmt(inp.dropOneDelta)}`);
if (out.nullCalibration) {
  const nc = out.nullCalibration;
  console.log(`null calibration    pooled ${nc.runs.map((x) => x.pooledCorrelation).join(', ')} (mean ${nc.meanPooledCorrelation})  IC mean ${nc.meanDailyIC}  → real minus null pooled ${nc.realMinusNullPooled}`);
  console.log(`                    null expectancy ${nc.runs.map((x) => x.expectancyR).join(', ')} R`);
}
const sv = out.limits.survivorship;
console.log(`survivorship proxy  stocks EW ${sv.equalWeightStockReturnPct}% (median ${sv.medianStockReturnPct}%) vs Nifty 50 ${sv.nifty50PriceReturnPct}%`);
console.log(`data quality        dropped rows ${quality.droppedRows}/${quality.rawRows}, zero-volume ${quality.zeroVolumeBars}, >20% moves ${quality.extremeMoves.length}, missing sessions ${quality.missingSessions}, duplicates ${quality.duplicateDates}`);
console.log(`bar filter          ${out.barFilter}${KEEP_PLACEHOLDERS ? '' : `; ${placeholderBarsDropped} placeholder bars dropped`}`);
console.log(`\nWrote ${path.relative(ROOT, outFile)}`);
