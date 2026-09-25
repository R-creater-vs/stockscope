/**
 * Pure screener aggregation — types and functions that turn a flat list of
 * scored stocks into buckets and sector stats.
 *
 * This module has NO server dependencies (no data fetching), so it is safe to
 * import into client components. That is what lets price filtering re-bucket the
 * suggestions instantly in the browser, with no round-trip to the server.
 */

import type { Verdict } from './swing';

/** Named setups a trader can act on, rather than a bare score. */
export type SetupTag = 'Breakout' | 'Momentum' | 'Pullback' | 'Squeeze' | 'Reversal';

export interface ScreenRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  score: number;
  verdict: Verdict;
  confidence: number;
  rsi14: number | null;
  adx14: number | null;
  volumeRatio: number | null;
  atrPercent: number | null;
  roc5: number | null;
  roc20: number | null;
  roc60: number | null;
  tags: SetupTag[];
  riskFlags: number;
  /** Reward-to-risk of the generated plan — lets the UI rank by trade quality. */
  riskReward: number | null;
  /**
   * Lightweight backtest of this stock's swing setups over the past ~year,
   * computed in the scan from the same bars. `btWinRate`/`btExpectancyR` are null
   * when no trades fired (`btTrades === 0`). Small samples — context, not a forecast.
   */
  btWinRate: number | null;
  btTrades: number;
  btExpectancyR: number | null;
  /** Mid-term and long-trend (price-only proxy) verdicts, for timeframe agreement. */
  midVerdict: Verdict;
  longTrendVerdict: Verdict;
}

export type Regime = 'Bullish' | 'Neutral' | 'Bearish';

export interface MarketContext {
  /** Date of the daily bar used by the regime. Older persisted scans may omit it. */
  sourceBarDate?: string;
  name: string;
  price: number;
  changePercent: number;
  regime: Regime;
  note: string;
  above50: boolean;
  rsi14: number | null;
}

export interface SectorStat {
  sector: string;
  count: number;
  /** Average technical score across the sector's stocks. */
  avgScore: number;
  /** Average 1-month rate of change — the momentum axis of rotation. */
  avgMomentum: number;
  /** Share of the sector's stocks on a BUY/STRONG_BUY verdict. */
  breadth: number;
  /** The single strongest name, so the tile is a launch point, not a dead end. */
  leader: { symbol: string; name: string; score: number } | null;
}

export interface Bucket {
  id: string;
  title: string;
  blurb: string;
  rows: ScreenRow[];
}

/**
 * Sector rotation. Money moves into sectors before individual names, so a sector
 * scoring well while the broad index is weak (pharma in a falling market, say) is
 * exactly the tell a stock-by-stock list buries.
 */
export function buildSectorRotation(rows: ScreenRow[]): SectorStat[] {
  const bySector = new Map<string, ScreenRow[]>();
  for (const r of rows) {
    const list = bySector.get(r.sector) ?? [];
    list.push(r);
    bySector.set(r.sector, list);
  }

  const stats: SectorStat[] = [];
  for (const [sector, list] of bySector) {
    if (list.length < 2) continue; // A sector needs a few names to mean anything.
    const avg = (sel: (r: ScreenRow) => number) =>
      list.reduce((s, r) => s + sel(r), 0) / list.length;
    const leader = [...list].sort((a, b) => b.score - a.score)[0];

    stats.push({
      sector,
      count: list.length,
      avgScore: Math.round(avg((r) => r.score) * 10) / 10,
      avgMomentum: Math.round(avg((r) => r.roc20 ?? 0) * 10) / 10,
      breadth: Math.round(
        (list.filter((r) => r.verdict === 'BUY' || r.verdict === 'STRONG_BUY').length /
          list.length) *
          100,
      ),
      leader: leader ? { symbol: leader.symbol, name: leader.name, score: leader.score } : null,
    });
  }

  return stats.sort((a, b) => b.avgScore - a.avgScore);
}

/* ----------------------------------------------------- high conviction */

const isBuy = (v: Verdict) => v === 'BUY' || v === 'STRONG_BUY';

/**
 * The high-conviction filter. Every condition is chosen A PRIORI — before looking
 * at any backtest result — so filtering on them is not the circular "keep what
 * already worked" trap. In order:
 *   • Market in an uptrend (index above its 50-day EMA) — don't fight the index.
 *   • All three timeframes point up: swing (short), mid-term, and long trend.
 *   • Confidence is real (the signals agree), and reward:risk is worth taking.
 *
 * Deliberately NOT gated on the stock's past backtest — that would rig the
 * aggregate we then show. Instead we display that aggregate honestly so the
 * filter has to prove itself against the plain buy list.
 */
export function isHighConviction(r: ScreenRow, market: MarketContext | null): boolean {
  const marketOk = market ? market.above50 : true;
  return (
    marketOk &&
    isBuy(r.verdict) &&
    isBuy(r.midVerdict) &&
    isBuy(r.longTrendVerdict) &&
    r.confidence >= 55 &&
    (r.riskReward ?? 0) >= 1.3
  );
}

export interface BacktestAgg {
  stocks: number;
  trades: number;
  /** Trade-weighted win rate, %. */
  winRate: number;
  /** Trade-weighted average expectancy, in R. */
  expectancyR: number;
  /** Share of stocks with positive expectancy, %. */
  positiveShare: number;
}

/**
 * Pool the per-stock lightweight backtests over a set of rows into one honest
 * read. Because the high-conviction filter does NOT select on these numbers,
 * this aggregate is a fair (if small-sample) test of whether the filter actually
 * corresponds to setups that paid off — including the honest possibility that it
 * doesn't beat the plain buy list by much.
 */
export function aggregateBacktest(rows: ScreenRow[]): BacktestAgg {
  const rs = rows.filter((r) => r.btTrades > 0 && r.btWinRate !== null);
  const trades = rs.reduce((s, r) => s + r.btTrades, 0);
  const wins = rs.reduce((s, r) => s + Math.round(((r.btWinRate ?? 0) / 100) * r.btTrades), 0);
  const wtR = trades ? rs.reduce((s, r) => s + (r.btExpectancyR ?? 0) * r.btTrades, 0) / trades : 0;
  const pos = rs.filter((r) => (r.btExpectancyR ?? 0) > 0).length;
  return {
    stocks: rows.length,
    trades,
    winRate: trades ? (wins / trades) * 100 : 0,
    expectancyR: wtR,
    positiveShare: rs.length ? (pos / rs.length) * 100 : 0,
  };
}

/**
 * Slice the ranked list into the buckets a trader actually shops from. Each is
 * capped so the page stays scannable rather than becoming another wall of rows.
 */
/**
 * Rank for the "best track record" bucket. Blends the past-year win rate with
 * expectancy (R) — expectancy is the metric that actually says "this made money",
 * so it's weighted heavily; a gaudy win rate on tiny payoffs shouldn't outrank a
 * genuinely profitable setup.
 */
function trackScore(r: ScreenRow): number {
  return (r.btWinRate ?? 0) + (r.btExpectancyR ?? 0) * 40;
}

export function buildBuckets(rows: ScreenRow[], perBucket = 12): Bucket[] {
  const byScore = (a: ScreenRow, b: ScreenRow) => b.score - a.score;

  return [
    {
      id: 'best',
      title: 'Bullish readings',
      blurb: 'Bullish weighted rule readings with confidence of at least 50. Confidence is signal agreement, not a profit probability.',
      rows: rows
        .filter((r) => (r.verdict === 'BUY' || r.verdict === 'STRONG_BUY') && r.confidence >= 50)
        .sort(byScore)
        .slice(0, perBucket),
    },
    {
      id: 'track',
      title: 'Historical results',
      blurb:
        'Ranked by how each stock’s swing setups actually did over the past year — net of costs, no look-ahead. Honest history on a small sample, not a forecast. Set the price filter to ₹100–250 for affordable names.',
      rows: rows
        .filter((r) => r.btTrades >= 5) // need a meaningful sample, not a 2-trade fluke
        .sort((a, b) => trackScore(b) - trackScore(a))
        .slice(0, perBucket),
    },
    {
      id: 'momentum',
      title: 'Momentum',
      blurb: 'Price above aligned 20/50 EMAs, ADX above 25, positive DI leading, and RSI from 55 to 72.',
      rows: rows
        .filter((r) => r.tags.includes('Momentum'))
        .sort((a, b) => (b.roc20 ?? 0) - (a.roc20 ?? 0))
        .slice(0, perBucket),
    },
    {
      id: 'breakout',
      title: 'Breakouts',
      blurb: 'Above the prior 20-day high on above-average volume in the scanned daily bars.',
      rows: rows.filter((r) => r.tags.includes('Breakout')).sort(byScore).slice(0, perBucket),
    },
    {
      id: 'pullback',
      title: 'Pullbacks',
      blurb: 'Price above the 50-day EMA and at or below 102% of the 20-day EMA; RSI 40–58. A pullback can continue.',
      rows: rows.filter((r) => r.tags.includes('Pullback')).sort(byScore).slice(0, perBucket),
    },
    {
      id: 'squeeze',
      title: 'Squeezes',
      blurb: 'Bollinger bandwidth in the lowest fifth of available history (up to one year). Timing and direction of any move are unknown.',
      rows: rows.filter((r) => r.tags.includes('Squeeze')).sort(byScore).slice(0, perBucket),
    },
    {
      id: 'reversal',
      title: 'Oversold bounce',
      blurb: 'RSI below 38 with a rising MACD histogram. Counter-trend conditions can persist.',
      rows: rows.filter((r) => r.tags.includes('Reversal')).sort(byScore).slice(0, perBucket),
    },
  ];
}
