/**
 * The universe-wide backtest study — the honest verdict on whether an engine has
 * an edge. Runs the point-in-time backtest across every liquid NSE name and pools
 * the results, so no single stock or period dominates the conclusion.
 *
 * Parametrised by engine ('short' | 'mid' | 'long'), so the same rigorous
 * machinery validates every horizon. Each engine is computed at most once and
 * cached hard; concurrent callers share the single in-flight run.
 *
 * NOTE on the 'long' engine: it uses a PRICE-ONLY trend proxy, not the real
 * fundamentals-driven long engine. Yahoo only exposes today's fundamentals, so a
 * point-in-time fundamental backtest is impossible without look-ahead. The proxy
 * validates only the trend component of the long thesis, and is labelled as such.
 */

import {
  aggregate,
  backtestSymbolAsync,
  ENGINE_CONFIGS,
  STRATEGIES,
  type AggregateStudy,
  type Engine,
} from './backtest';
import { ema } from './indicators';
import { fetchBars, type FetchSpan } from './providers';
import { MARKET_INDEX, UNIVERSE } from './universe';

/**
 * An explicit date window, used for out-of-sample testing. The default (no
 * window) studies the most recent three years — the period the engines were
 * built against. Supplying an earlier, non-overlapping window is what turns a
 * backtest into a genuine test rather than a description of the data it was
 * tuned on.
 */
export interface StudyWindow {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
}

export interface StudyResult {
  engine: Engine;
  /** True only for 'long': the tested strategy is a price proxy, not the real engine. */
  isProxy: boolean;
  /** Null means the default trailing-3-year window. */
  window: StudyWindow | null;
  /** The engine as-is: every qualifying signal taken. */
  study: AggregateStudy;
  /** The same engine, but longs only when Nifty is above its 50-EMA. */
  studyRegimeFiltered: AggregateStudy | null;
  generatedAt: string;
  durationMs: number;
  symbolsAttempted: number;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — the study barely moves intraday.
const cached = new Map<string, { at: number; result: StudyResult }>();
const inFlight = new Map<string, Promise<StudyResult>>();

const keyOf = (engine: Engine, w: StudyWindow | null) =>
  `${engine}:${w ? `${w.from}..${w.to}` : 'recent3y'}`;

export function cachedStudy(engine: Engine = 'short', window: StudyWindow | null = null): StudyResult | null {
  const c = cached.get(keyOf(engine, window));
  if (c && Date.now() - c.at < CACHE_TTL_MS) return c.result;
  return null;
}

export async function runStudy(
  engine: Engine = 'short',
  window: StudyWindow | null = null,
): Promise<StudyResult> {
  const hit = cachedStudy(engine, window);
  if (hit) return hit;
  const key = keyOf(engine, window);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = execute(engine, window).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

const DAY_MS = 24 * 3600 * 1000;

function isoMinusDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Fetch span for the study. A windowed run pulls ONLY the window plus a warmup
 * buffer (~500 calendar days covers the 210-bar warmup with margin), not the
 * whole history back to the window. Requesting nine years per stock is what
 * throttled the last out-of-sample run down to 13 symbols; a bounded range keeps
 * coverage high.
 */
function spanFor(window: StudyWindow | null): FetchSpan {
  if (!window) return { years: 3 };
  return { from: isoMinusDays(window.from, 500), to: window.to };
}

async function execute(engine: Engine, window: StudyWindow | null): Promise<StudyResult> {
  const started = Date.now();
  const config = ENGINE_CONFIGS[engine];
  const strategy = STRATEGIES[engine];
  const span = spanFor(window);

  // Fetch all price series first (network-bound), then run the CPU-bound
  // backtests. One retry with a short backoff recovers the stocks Yahoo drops
  // under load — without it, ~a third of the universe fell out of the last run
  // purely to rate limiting. Bars before `window.from` are kept: they warm up
  // the engine so the entire window is testable, and the window gate inside
  // `backtestSymbol` ensures no decision is counted before `window.from`.
  const fetchOne = async (symbol: string) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { bars, symbol: resolved } = await fetchBars(symbol, span);
        if (bars.length >= config.warmup + 30) return { symbol: resolved, bars };
        return null;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    return null;
  };

  const [seriesList, regime] = await Promise.all([
    Promise.all(UNIVERSE.map((u) => fetchOne(u.symbol))),
    buildMarketRegime(span),
  ]);

  // One backtest per symbol produces both timelines (raw + regime-filtered) in a
  // single engine pass. `filtered` is projected onto the SymbolBacktest shape so
  // it can go through the same aggregate().
  const results = [];
  const resultsFiltered = [];
  for (const s of seriesList) {
    if (!s) continue;
    try {
      const bt = await backtestSymbolAsync(
        s.symbol,
        s.bars,
        config,
        regime ?? undefined,
        strategy,
        window ?? undefined,
      );
      results.push(bt);
      if (bt.filtered) {
        resultsFiltered.push({
          ...bt,
          trades: bt.filtered.trades,
          stats: bt.filtered.stats,
          equityCurve: bt.filtered.equityCurve,
        });
      }
    } catch {
      // A single symbol failing must not sink the whole study.
    }
  }

  const result: StudyResult = {
    engine,
    isProxy: engine === 'long',
    window,
    study: aggregate(results),
    studyRegimeFiltered: resultsFiltered.length ? aggregate(resultsFiltered) : null,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    symbolsAttempted: UNIVERSE.length,
  };

  cached.set(keyOf(engine, window), { at: Date.now(), result });
  return result;
}

/**
 * Nifty 50 uptrend by date: close above its 50-day EMA. This is the market
 * filter the app already surfaces as its regime banner, applied historically so
 * the backtest can measure whether obeying it would have helped.
 */
async function buildMarketRegime(span: FetchSpan): Promise<Record<string, boolean> | null> {
  try {
    const { bars } = await fetchBars(MARKET_INDEX.symbol, span);
    if (bars.length < 60) return null;
    const e50 = ema(bars.map((b) => b.close), 50);
    const map: Record<string, boolean> = {};
    bars.forEach((b, i) => {
      if (e50[i] !== null) map[b.date] = b.close > e50[i]!;
    });
    return map;
  } catch {
    return null;
  }
}
