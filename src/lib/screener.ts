/**
 * Scans the universe and ranks stocks by swing-setup quality.
 *
 * The scan is expensive (one price series per stock), so results are cached for
 * 15 minutes. That is well inside a swing trader's decision window — these are
 * daily-bar setups, not intraday ones, so a quarter-hour-old scan is not stale.
 */

import { adx, bollinger, donchian, ema, last, macd, roc, rsi, sma } from './indicators';
import type { Bar } from './indicators';
import { analyzeSwing, type Verdict } from './swing';
import { analyzeMidTerm } from './midterm';
import { backtestSymbolAsync, longTrendStrategy, type BacktestConfig } from './backtest';
import { fetchBars } from './providers';
import { MARKET_INDEX, UNIVERSE, type UniverseEntry } from './universe';
import type { MarketContext, Regime, ScreenRow, SetupTag } from './screenAggregate';
import { loadScreenCache, saveScreenCache } from './db';

// The pure aggregation (types + bucketing + sector rotation) lives in a
// server-dependency-free module so client components can re-run it for instant
// price filtering. Re-exported here so existing server callers are unchanged.
export type { Bucket, MarketContext, Regime, ScreenRow, SectorStat, SetupTag } from './screenAggregate';
export { buildBuckets, buildSectorRotation } from './screenAggregate';

export interface ScreenResult {
  market: MarketContext | null;
  rows: ScreenRow[];
  scanned: number;
  failed: number;
  generatedAt: string;
  durationMs: number;
}

/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 15 * 60 * 1000;
let cached: { at: number; result: ScreenResult } | null = null;
let inFlight: Promise<ScreenResult> | null = null;

/**
 * A deliberately LIGHT backtest for the screener column. It reuses the one-year
 * bar series the scan already fetched (no extra network) and uses a shorter
 * warmup so a single year still leaves a usable decision window. This is a rough
 * "have this stock's swing setups paid off lately?" read over a small sample —
 * honestly labelled as such in the UI — not the rigorous multi-year study the
 * per-stock report runs. The engine as a whole has no proven stable edge, so
 * these per-stock numbers are context, never a promise.
 */
const SCREEN_BT_CONFIG: BacktestConfig = {
  minVerdict: 'BUY',
  holdMaxDays: 15,
  costPct: 0.2,
  signalHorizon: 10,
  warmup: 120,
};

export function cachedScreen(): ScreenResult | null {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;
  return null;
}

/**
 * Load the last successful scan from disk into memory, so a fresh process
 * (a restart after Android reclaimed Termux, say) has something real to serve
 * the instant a request comes in — not a blank screen while a full ~170-symbol
 * scan runs cold. It will read as stale (its true age, however old) until the
 * background refresh below catches up, which is honest and correct.
 */
function primeFromDisk(): void {
  if (cached) return; // already have something in memory — never overwrite it with an older disk copy
  try {
    const persisted = loadScreenCache();
    if (!persisted) return;
    const result = JSON.parse(persisted.data) as ScreenResult;
    cached = { at: new Date(persisted.generatedAt).getTime(), result };
    console.log(
      `[screen] primed from disk: ${result.rows.length} stocks, generated ${persisted.generatedAt}`,
    );
  } catch (err) {
    console.error('[screen] failed to prime from disk', err);
  }
}

/**
 * Called once at server boot (from the scheduler, which is already excluded
 * from the Edge/middleware build — see next.config.ts). Primes memory from the
 * last saved scan, then kicks a background refresh immediately: even a
 * persisted cache is likely stale the moment the process restarts, which is
 * exactly the situation this exists for.
 */
export function warmScreenCache(): void {
  primeFromDisk();
  if (!inFlight) {
    inFlight = runScan().finally(() => {
      inFlight = null;
    });
  }
}

/**
 * The market regime on its own, independently cached (5 min). The global regime
 * banner loads on every page, so it must NOT trigger or wait on the full
 * 130-stock scan — it fetches only the index series, which is one cheap request.
 */
let marketCache: { at: number; ctx: MarketContext | null } | null = null;
const MARKET_TTL_MS = 5 * 60 * 1000;

export async function marketRegime(): Promise<MarketContext | null> {
  if (marketCache && Date.now() - marketCache.at < MARKET_TTL_MS) return marketCache.ctx;
  const ctx = await fetchMarketContext();
  marketCache = { at: Date.now(), ctx };
  return ctx;
}

/**
 * Serve-stale-while-revalidate: a fresh scan is always used if we have one, but
 * a request NEVER blocks on the live ~170-symbol scan as long as we have
 * anything at all to show (even minutes- or days-old, e.g. right after a
 * restart) — it gets that immediately, and a background refresh quietly
 * updates the cache for the next request. Only the very first scan a process
 * ever runs — nothing in memory, nothing on disk — makes a caller wait, and the
 * in-flight guard means concurrent requests in that window join the same scan
 * rather than each triggering their own and getting us rate-limited by Yahoo.
 *
 * Primes from disk here too, not only in warmScreenCache() at boot: Next's
 * production build can give the instrumentation hook and an API route separate
 * compiled module instances of this file, each with its own `cached` variable
 * — so the route handler cannot assume the scheduler's warm-up ran in the same
 * copy. Priming lazily on first use makes every instance self-sufficient.
 */
export async function screen(): Promise<ScreenResult> {
  const fresh = cachedScreen();
  if (fresh) return fresh;

  if (!cached) primeFromDisk();

  if (cached) {
    if (!inFlight) {
      inFlight = runScan().finally(() => {
        inFlight = null;
      });
    }
    return cached.result;
  }

  if (inFlight) return inFlight;
  inFlight = runScan().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runScan(): Promise<ScreenResult> {
  const started = Date.now();

  const [market, results] = await Promise.all([
    fetchMarketContext(),
    mapWithConcurrency(UNIVERSE, 8, scanOne),
  ]);

  const rows = results.filter((r): r is ScreenRow => r !== null).sort((a, b) => b.score - a.score);

  const result: ScreenResult = {
    market,
    rows,
    scanned: rows.length,
    failed: UNIVERSE.length - rows.length,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };

  // A patchy mobile connection can fail a chunk of the ~170 Yahoo calls mid-scan.
  // Rather than show — and persist — a visibly worse list than what we already
  // had, only accept the new scan if it isn't a drastic regression (or if there
  // was nothing to protect yet). A genuinely degraded scan is just discarded; it
  // gets retried on the next background refresh instead of flashing an empty or
  // half-populated screen at whoever happens to be looking right now.
  const previous = cached?.result ?? null;
  const previousCount = previous?.rows.length ?? 0;
  const healthy = rows.length >= 20 && (previousCount === 0 || rows.length >= previousCount * 0.6);

  if (!healthy && previous) {
    console.warn(
      `[screen] scan looked degraded (${rows.length} vs ${previousCount} stocks previously) — keeping the last good result`,
    );
    return previous;
  }

  cached = { at: Date.now(), result };
  try {
    saveScreenCache(JSON.stringify(result), result.generatedAt);
  } catch (err) {
    console.error('[screen] failed to persist cache', err);
  }
  return result;
}

/**
 * Score an arbitrary list of symbols with the same engine the universe scan
 * uses — this is what the watchlist calls, so a saved stock gets exactly the
 * card the discover page shows. Falls back to the symbol for a missing name and
 * to em-dash for a missing sector.
 */
export async function scanSymbols(
  entries: { symbol: string; name?: string; sector?: string }[],
): Promise<ScreenRow[]> {
  const results = await mapWithConcurrency(entries, 8, (e) =>
    scanOne({
      symbol: e.symbol,
      name: e.name ?? e.symbol.replace('.NS', ''),
      sector: e.sector ?? '—',
    }),
  );
  return results.filter((r): r is ScreenRow => r !== null).sort((a, b) => b.score - a.score);
}

async function scanOne(entry: UniverseEntry): Promise<ScreenRow | null> {
  try {
    const { bars } = await fetchBars(entry.symbol, 1);
    if (bars.length < 60) return null;

    const a = analyzeSwing(bars);
    const s = a.snapshot;
    const prev = bars.at(-2)?.close;
    const changePercent = prev ? ((s.price - prev) / prev) * 100 : 0;

    // Mid- and long-trend verdicts from the same bars — the other two timeframes
    // the high-conviction filter needs for "all timeframes agree". The long one
    // is the price-only trend proxy (above a rising 200-SMA + momentum), not the
    // fundamentals engine, which would need a per-stock company fetch.
    let midVerdict: Verdict = 'HOLD';
    let longTrendVerdict: Verdict = 'HOLD';
    try {
      midVerdict = analyzeMidTerm(bars).verdict;
    } catch {
      /* keep HOLD */
    }
    try {
      longTrendVerdict = longTrendStrategy(bars).verdict;
    } catch {
      /* keep HOLD */
    }

    // Lightweight backtest over the same, already-fetched bars — the "past year"
    // column on the buy list. Failures leave the fields null (shown as "—").
    let btWinRate: number | null = null;
    let btExpectancyR: number | null = null;
    let btTrades = 0;
    try {
      const bt = await backtestSymbolAsync(entry.symbol, bars, SCREEN_BT_CONFIG);
      btTrades = bt.stats.trades;
      if (btTrades > 0) {
        btWinRate = Math.round(bt.stats.winRate);
        btExpectancyR = Math.round(bt.stats.expectancyR * 100) / 100;
      }
    } catch {
      /* leave the backtest fields null */
    }

    return {
      symbol: entry.symbol,
      name: entry.name,
      sector: entry.sector,
      price: s.price,
      changePercent,
      score: a.score,
      verdict: a.verdict,
      confidence: a.confidence,
      rsi14: s.rsi14,
      adx14: s.adx14,
      volumeRatio: s.volumeRatio,
      atrPercent: s.atr14 !== null ? (s.atr14 / s.price) * 100 : null,
      roc5: s.roc5,
      roc20: s.roc20,
      roc60: last(roc(bars.map((b) => b.close), 60)),
      tags: detectSetups(bars),
      riskFlags: a.riskFlags.length,
      riskReward: a.plan?.riskReward ?? null,
      btWinRate,
      btTrades,
      btExpectancyR,
      midVerdict,
      longTrendVerdict,
    };
  } catch {
    return null;
  }
}

/**
 * Named setups. These are deliberately stricter than the headline score — a
 * stock can score well without presenting a clean, nameable entry today, and
 * "nothing to do right now" is a legitimate answer.
 */
function detectSetups(bars: Bar[]): SetupTag[] {
  const closes = bars.map((b) => b.close);
  const tags: SetupTag[] = [];

  const price = closes.at(-1)!;
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const r = last(rsi(closes, 14));
  const a = adx(bars, 14);
  const adxV = last(a.adx);
  const plusDI = last(a.plusDI);
  const minusDI = last(a.minusDI);
  const m = macd(closes);
  const hist = last(m.histogram);
  const histPrev = m.histogram[m.histogram.length - 2] ?? null;
  const vol20 = last(sma(bars.map((b) => b.volume), 20));
  const volRatio = vol20 ? bars.at(-1)!.volume / vol20 : null;
  const dc = donchian(bars, 20);
  const bb = bollinger(closes, 20);
  const bwSeries = bb.bandwidth.slice(-252).filter((v): v is number => v !== null);
  const bwNow = bwSeries.at(-1);

  // Breakout: clearing the 20-day high on real volume.
  if (dc && price > dc.high && (volRatio ?? 0) > 1.2) tags.push('Breakout');

  // Momentum: an established uptrend that is still running, not yet exhausted.
  if (
    adxV !== null && adxV > 25 &&
    plusDI !== null && minusDI !== null && plusDI > minusDI &&
    r !== null && r >= 55 && r <= 72 &&
    e20 !== null && e50 !== null && price > e20 && e20 > e50
  ) {
    tags.push('Momentum');
  }

  // Pullback: uptrend intact, price has come back to the 20-EMA. The lowest-risk
  // entry of the five — you buy near support rather than chasing.
  if (
    e20 !== null && e50 !== null && e20 > e50 && price > e50 &&
    r !== null && r >= 40 && r <= 58 &&
    price <= e20 * 1.02
  ) {
    tags.push('Pullback');
  }

  // Squeeze: volatility compressed into the bottom fifth of its yearly range.
  if (bwNow !== undefined && bwSeries.length > 60) {
    const pctile = bwSeries.filter((v) => v < bwNow).length / bwSeries.length;
    if (pctile < 0.2) tags.push('Squeeze');
  }

  // Reversal: oversold, but selling pressure is easing. Counter-trend, so it
  // carries the most risk — surfaced separately in the UI for that reason.
  if (r !== null && r < 38 && hist !== null && histPrev !== null && hist > histPrev) {
    tags.push('Reversal');
  }

  return tags;
}

/**
 * Nifty 50 regime. This matters more than most single-stock signals: swing longs
 * fail far more often when the index itself is below its 50-EMA, however good
 * the individual chart looks.
 */
async function fetchMarketContext(): Promise<MarketContext | null> {
  try {
    const { bars } = await fetchBars(MARKET_INDEX.symbol, 1);
    if (bars.length < 60) return null;

    const closes = bars.map((b) => b.close);
    const price = closes.at(-1)!;
    const prev = closes.at(-2)!;
    const e20 = last(ema(closes, 20));
    const e50 = last(ema(closes, 50));
    const r = last(rsi(closes, 14));

    const above20 = e20 !== null && price > e20;
    const above50 = e50 !== null && price > e50;

    const regime: Regime = above20 && above50 ? 'Bullish' : !above20 && !above50 ? 'Bearish' : 'Neutral';

    const note =
      regime === 'Bullish'
        ? 'The index is above both its 20- and 50-day EMAs. Long setups have the wind behind them.'
        : regime === 'Bearish'
          ? 'The index is below both its 20- and 50-day EMAs. Long setups fail more often in this tape — trade smaller, or wait.'
          : 'The index is between its 20- and 50-day EMAs. Mixed conditions; be selective and keep size modest.';

    return {
      name: MARKET_INDEX.name,
      sourceBarDate: bars.at(-1)!.date,
      price,
      changePercent: ((price - prev) / prev) * 100,
      regime,
      note,
      above50,
      rsi14: r,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */

/** Bounded-concurrency map. Keeps us under Yahoo's rate limit without serialising. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return out;
}
