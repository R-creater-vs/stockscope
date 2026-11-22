/**
 * Weeks-to-months evidence for the mid-term (position) horizon. Pure: no I/O.
 *
 * This module DESCRIBES a stock for someone holding for weeks to months. It
 * does not change, feed or re-weight the mid-term score in `midterm.ts`, whose
 * stored historical record must keep describing exactly the rules it tested.
 * None of the observations here have been historically validated; each one
 * carries its rule, lookback, source-bar date and data status so it can be
 * checked by hand.
 *
 * Conventions:
 *  - Missing inputs stay missing (null / "unavailable"); nothing is zero-filled.
 *  - Returns are PRICE returns from provider closes. Dividends are not added
 *    back, for stocks or indices (the Nifty 50 used here is the price index).
 *  - "Sessions" are trading days in the provider's daily series.
 *  - Thresholds are explicit app choices, stated next to each reading.
 */

import { atr, ema, last, resampleWeekly, roc, sma, type Bar } from './indicators';
import { inr, num, pct } from './format';
import { scanCandles, weeklyCandles, type CandleScan } from './candlePatterns';
import { latestCross, scanIndicatorEvents, type CrossEvent, type IndicatorScan } from './indicatorEvents';
import type { BenchmarkIndex, SectorBenchmarkChoice } from './sectorBenchmarks';
import type { TimeframeAnalysis } from './timeframes';
import type { CompanyData, ReportedQuarter, ReportedResults } from './yahoo';
import { ENGINE_CONFIGS } from './backtest';

export type Tone = 'positive' | 'negative' | 'neutral' | 'caution';
export type EvidenceStatus = 'available' | 'partial' | 'insufficient' | 'unavailable';

export interface Observation {
  id: string;
  label: string;
  /** Raw computed values. */
  reading: string;
  /** What the stated rule says about the reading. */
  interpretation: string;
  rule: string;
  timeframe: 'daily' | 'weekly' | 'snapshot' | 'event';
  lookback: string;
  asOf: string | null;
  status: EvidenceStatus;
  tone: Tone;
}

export interface TrendCheck {
  id: 'above200' | 'stack' | 'slope' | 'weekly';
  label: string;
  /** +1 rising condition met, −1 falling condition met, 0 neither, null unavailable. */
  state: 1 | 0 | -1 | null;
  reading: string;
}

export interface TrendRead {
  subject: string;
  label: 'Rising' | 'Falling' | 'Mixed' | 'Insufficient history' | 'Unavailable';
  tone: Tone;
  rising: number;
  falling: number;
  available: number;
  checks: TrendCheck[];
  asOf: string | null;
  levels: {
    close: number | null;
    sma50: number | null;
    sma100: number | null;
    sma200: number | null;
    sma200Prior: number | null;
    weeklyEma10: number | null;
    weeklyEma30: number | null;
  };
  note: string | null;
}

export interface RelativeWindow {
  sessions: number;
  label: string;
  from: string | null;
  to: string | null;
  stock: number | null;
  nifty: number | null;
  vsNifty: number | null;
  sector: number | null;
  vsSector: number | null;
}

export type GroupId =
  | 'market' | 'sector' | 'trend' | 'relative' | 'momentum'
  | 'structure' | 'patterns' | 'fundamentals' | 'events' | 'risk';

export interface SummaryRow {
  id: GroupId;
  title: string;
  reading: string;
  tone: Tone;
  asOf: string;
  status: EvidenceStatus;
}

export interface FundamentalItem {
  label: string;
  value: string;
  basis: string;
  available: boolean;
}

export interface FundamentalsContext {
  status: EvidenceStatus;
  growthLabel: 'Growing' | 'Contracting' | 'Mixed' | 'One field only' | 'Unknown';
  growthNote: string;
  items: FundamentalItem[];
  quarters: ReportedQuarter[];
  quartersRetrievedAt: string | null;
  unavailable: string[];
  sourceNote: string;
}

export interface GapScenario {
  price: number;
  stop: number;
  plannedLossPct: number;
  gapPct: number;
  gapDate: string;
  scenarioLossPct: number;
  multiple: number;
}

export interface PositionEvidence {
  version: 1;
  computedAt: string;
  horizon: {
    label: string;
    engine: 'mid';
    signalHorizonSessions: number;
    maxHoldSessions: number;
    costPct: number;
  };
  stockBarDate: string;
  lastBarComplete: boolean | null;
  benchmark: { index: BenchmarkIndex; status: 'available' | 'unavailable'; lastBar: string | null; reason: string | null };
  sector: {
    choice: SectorBenchmarkChoice;
    status: 'available' | 'unavailable' | 'not-mapped';
    lastBar: string | null;
    reason: string | null;
  };
  summary: SummaryRow[];
  market: TrendRead;
  sectorTrend: TrendRead;
  stockTrend: TrendRead;
  crosses: Observation[];
  relative: { windows: RelativeWindow[]; observations: Observation[]; note: string };
  momentum: Observation[];
  structure: Observation[];
  candles: { daily: CandleScan; weekly: CandleScan };
  indicators: IndicatorScan;
  fundamentals: FundamentalsContext;
  events: Observation[];
  risk: { observations: Observation[]; flags: string[]; gapScenario: GapScenario | null };
  conflicts: string[];
  invalidation: string[];
  limitations: string[];
}

export interface PositionInput {
  name: string;
  bars: Bar[];
  company: CompanyData;
  mid: TimeframeAnalysis;
  benchmark: { index: BenchmarkIndex; bars: Bar[] | null; reason: string | null };
  sector: { choice: SectorBenchmarkChoice; bars: Bar[] | null; reason: string | null };
  results: ReportedResults | null;
  /** ISO time the report was computed; used for completeness and freshness only. */
  computedAt: string;
}

/* ----------------------------------------------------------------- helpers */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The mid engine's 40-session maximum hold, expressed as calendar days (8 weeks). */
const HOLD_CALENDAR_DAYS = 56;
const MIN_TREND_BARS = 220;
const CROSS_HOLD = 5;
const RS_BAND = 1; // percentage points treated as "in line"

export function istDate(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whether the latest daily bar is a finished session. Yahoo updates today's
 * daily bar while the market is open, so a bar dated today (IST) is complete
 * only once the provider reports the market as closed. Unknown stays unknown.
 */
export function lastBarCompletion(lastBarDate: string, marketState: string | null, computedAt: string): boolean | null {
  if (lastBarDate !== istDate(computedAt)) return true;
  if (marketState === 'POST' || marketState === 'POSTPOST' || marketState === 'CLOSED') return true;
  if (marketState === 'REGULAR' || marketState === 'PRE' || marketState === 'PREPRE') return false;
  return null;
}

const signedPct = (n: number | null, d = 1) => pct(n, d, true);
const pp = (n: number | null) => (n === null || !isFinite(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} pts`);

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Annualised volatility of daily log returns over the last `sessions` returns, in percent. */
function annualVol(closes: number[], sessions: number): number | null {
  if (closes.length < sessions + 1) return null;
  const sd = stdev(logReturns(closes.slice(-(sessions + 1))));
  return sd === null ? null : sd * Math.sqrt(252) * 100;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function lastCompleteIndex(bars: Bar[], complete: boolean | null): number {
  return complete === true ? bars.length - 1 : bars.length - 2;
}

/* ------------------------------------------------------------- trend state */

function trendRead(subject: string, bars: Bar[] | null, reason: string | null, money: boolean): TrendRead {
  const fmt = (n: number | null) => (money ? inr(n) : num(n));
  const emptyLevels = { close: null, sma50: null, sma100: null, sma200: null, sma200Prior: null, weeklyEma10: null, weeklyEma30: null };
  if (!bars || bars.length === 0) {
    return { subject, label: 'Unavailable', tone: 'neutral', rising: 0, falling: 0, available: 0, checks: [], asOf: null, levels: emptyLevels, note: reason ?? 'No price history was available.' };
  }
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const s200 = sma(closes, 200);
  const close = closes[n - 1];
  const sma50 = last(sma(closes, 50));
  const sma100 = n >= 100 ? last(sma(closes, 100)) : null;
  const sma200 = s200[n - 1];
  const sma200Prior = n > 20 ? s200[n - 21] : null;
  const weekly = resampleWeekly(bars);
  const wCloses = weekly.map((b) => b.close);
  const weeklyEma10 = weekly.length >= 32 ? last(ema(wCloses, 10)) : null;
  const weeklyEma30 = weekly.length >= 32 ? last(ema(wCloses, 30)) : null;
  const wClose = wCloses[wCloses.length - 1] ?? null;
  const levels = { close, sma50, sma100, sma200, sma200Prior, weeklyEma10, weeklyEma30 };
  const asOf = bars[n - 1].date;

  if (n < MIN_TREND_BARS || sma200 === null || sma200Prior === null || sma50 === null) {
    return {
      subject, label: 'Insufficient history', tone: 'neutral', rising: 0, falling: 0, available: 0, checks: [], asOf, levels,
      note: `${n} daily bars are available; the four trend checks need at least ${MIN_TREND_BARS} (a 200-session average plus its change over 20 sessions).`,
    };
  }

  const weeklyState: 1 | 0 | -1 | null =
    weeklyEma10 === null || weeklyEma30 === null || wClose === null
      ? null
      : wClose > weeklyEma10 && weeklyEma10 > weeklyEma30 ? 1 : wClose < weeklyEma10 && weeklyEma10 < weeklyEma30 ? -1 : 0;
  const checks: TrendCheck[] = [
    {
      id: 'above200',
      label: 'Close above its 200-day average',
      state: close > sma200 ? 1 : -1,
      reading: `Close ${fmt(close)} vs 200-day ${fmt(sma200)} (${signedPct((close / sma200 - 1) * 100)})`,
    },
    {
      id: 'stack',
      label: '50-day average above the 200-day average',
      state: sma50 > sma200 ? 1 : -1,
      reading: `50-day ${fmt(sma50)} vs 200-day ${fmt(sma200)} (${signedPct((sma50 / sma200 - 1) * 100)})`,
    },
    {
      id: 'slope',
      label: '200-day average higher than 20 sessions earlier',
      state: sma200 > sma200Prior ? 1 : sma200 < sma200Prior ? -1 : 0,
      reading: `200-day ${fmt(sma200)} vs ${fmt(sma200Prior)} 20 sessions earlier (${signedPct((sma200 / sma200Prior - 1) * 100, 2)})`,
    },
    {
      id: 'weekly',
      label: 'Weekly close above the 10-week EMA, which is above the 30-week EMA',
      state: weeklyState,
      reading:
        weeklyState === null
          ? `Needs 32 weekly bars; ${weekly.length} available.`
          : `Weekly close ${fmt(wClose)} · 10-week EMA ${fmt(weeklyEma10)} · 30-week EMA ${fmt(weeklyEma30)} (current week counted to date)`,
    },
  ];
  const available = checks.filter((c) => c.state !== null);
  const rising = available.filter((c) => c.state === 1).length;
  const falling = available.filter((c) => c.state === -1).length;
  const label = rising === available.length ? 'Rising' : falling === available.length ? 'Falling' : 'Mixed';
  return {
    subject,
    label,
    tone: label === 'Rising' ? 'positive' : label === 'Falling' ? 'negative' : 'neutral',
    rising,
    falling,
    available: available.length,
    checks,
    asOf,
    levels,
    note: weeklyState === null ? 'The weekly check is unavailable, so the classification uses the three daily checks.' : null,
  };
}

function trendSummary(t: TrendRead): string {
  if (t.label === 'Unavailable' || t.label === 'Insufficient history') return t.label;
  return `${t.label} · ${t.rising} of ${t.available} rising checks met`;
}

/* --------------------------------------------------------------- relative */

function alignedCloses(stock: Bar[], others: (Bar[] | null)[]) {
  const maps = others.map((o) => (o ? new Map<string, number>(o.map((b): [string, number] => [b.date, b.close])) : null));
  const dates: string[] = [];
  const s: number[] = [];
  const series: (number[] | null)[] = maps.map((m) => (m ? [] : null));
  for (const b of stock) {
    if (maps.some((m) => m !== null && !m.has(b.date))) continue;
    dates.push(b.date);
    s.push(b.close);
    maps.forEach((m, k) => { if (m) series[k]!.push(m.get(b.date)!); });
  }
  return { dates, stock: s, series };
}

/* ----------------------------------------------------------------- builder */

export function buildPositionEvidence(input: PositionInput): PositionEvidence {
  const { bars, company, mid, computedAt } = input;
  const n = bars.length;
  const lastBar = bars[n - 1];
  const stockBarDate = lastBar.date;
  const lastBarComplete = lastBarCompletion(stockBarDate, company.quote.marketState, computedAt);
  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const close = closes[n - 1];
  const config = ENGINE_CONFIGS.mid;
  const niftyBars = input.benchmark.bars && input.benchmark.bars.length >= 60 ? input.benchmark.bars : null;
  const sectorBars = input.sector.bars && input.sector.bars.length >= 60 ? input.sector.bars : null;
  const benchName = input.benchmark.index.name;
  const sectorName = input.sector.choice.index?.name ?? 'Sector index';

  const benchmark: PositionEvidence['benchmark'] = {
    index: input.benchmark.index,
    status: niftyBars ? 'available' : 'unavailable',
    lastBar: niftyBars ? niftyBars[niftyBars.length - 1].date : null,
    reason: niftyBars ? null : input.benchmark.reason ?? 'The index series could not be retrieved.',
  };
  const sector: PositionEvidence['sector'] = {
    choice: input.sector.choice,
    status: !input.sector.choice.index ? 'not-mapped' : sectorBars ? 'available' : 'unavailable',
    lastBar: sectorBars ? sectorBars[sectorBars.length - 1].date : null,
    reason: !input.sector.choice.index ? input.sector.choice.basis : sectorBars ? null : input.sector.reason ?? 'The sector index series could not be retrieved.',
  };

  /* --- Trend reads ------------------------------------------------------- */
  const market = trendRead(benchName, niftyBars, benchmark.reason, false);
  const sectorTrend = input.sector.choice.index
    ? trendRead(sectorName, sectorBars, sector.reason, false)
    : { ...trendRead(sectorName, null, sector.reason, false), note: sector.reason };
  const stockTrend = trendRead(input.name, bars, null, true);

  /* --- Crosses (completed bars only) -------------------------------------- */
  const lastComplete = lastCompleteIndex(bars, lastBarComplete);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const crosses: Observation[] = [];
  const crossObservation = (
    id: string,
    label: string,
    event: CrossEvent | null,
    upText: string,
    downText: string,
    rule: string,
    comparableFrom: string | null,
  ): Observation => {
    if (!event) {
      return {
        id, label,
        reading: comparableFrom ? `No crossover between ${comparableFrom} and ${dates[lastComplete] ?? stockBarDate}.` : 'Not enough history for a 200-session average.',
        interpretation: comparableFrom ? 'The two lines kept the same order throughout the comparable period.' : 'Unavailable.',
        rule, timeframe: 'daily', lookback: 'All fetched history (about two years)', asOf: dates[lastComplete] ?? null,
        status: comparableFrom ? 'available' : 'insufficient', tone: 'neutral',
      };
    }
    const up = event.direction === 'up';
    return {
      id, label,
      reading: `${up ? upText : downText} on ${event.date}; ${event.heldBars} completed session${event.heldBars === 1 ? '' : 's'} on the new side${
        event.status === 'confirmed' ? `, confirmed ${event.statusDate}` : `, awaiting confirmation (${CROSS_HOLD} needed)`
      }.`,
      interpretation: event.status === 'confirmed' ? `The latest crossover was ${up ? 'upward' : 'downward'} and met the hold rule.` : `The latest crossover was ${up ? 'upward' : 'downward'} but has not yet met the hold rule.`,
      rule, timeframe: 'daily', lookback: 'All fetched history (about two years)', asOf: dates[lastComplete] ?? null,
      status: 'available', tone: up ? 'positive' : 'negative',
    };
  };
  const firstBoth = s200.findIndex((v) => v !== null);
  const comparableFrom = firstBoth >= 0 && firstBoth + 1 <= lastComplete ? dates[firstBoth + 1] : null;
  crosses.push(crossObservation(
    'cross-50-200', '50-day vs 200-day average',
    latestCross(s50, s200, dates, lastComplete, CROSS_HOLD, Math.max(1, firstBoth + 1)),
    '50-day crossed above the 200-day (often called a golden cross)',
    '50-day crossed below the 200-day (often called a death cross)',
    `A crossover is the first completed session where the 50-day simple average moves to the other side of the 200-day. It is confirmed after ${CROSS_HOLD} consecutive completed sessions on the new side.`,
    comparableFrom,
  ));
  crosses.push(crossObservation(
    'cross-close-200', 'Close vs 200-day average',
    latestCross(closes, s200, dates, lastComplete, CROSS_HOLD, Math.max(1, firstBoth + 1)),
    'Close moved above the 200-day average',
    'Close moved below the 200-day average',
    `The first completed close on the other side of the 200-day simple average, confirmed after ${CROSS_HOLD} consecutive completed closes on the new side.`,
    comparableFrom,
  ));

  /* --- Relative strength ------------------------------------------------- */
  const aligned = alignedCloses(bars, [niftyBars, sectorBars]);
  const [alignedNifty, alignedSector] = aligned.series;
  const windows: RelativeWindow[] = [63, 126, 252].map((w) => {
    const label = w === 63 ? '3 months (63 sessions)' : w === 126 ? '6 months (126 sessions)' : '12 months (252 sessions)';
    const len = aligned.dates.length;
    if (len <= w || (!alignedNifty && !alignedSector)) {
      return { sessions: w, label, from: null, to: null, stock: null, nifty: null, vsNifty: null, sector: null, vsSector: null };
    }
    const a = len - 1 - w;
    const z = len - 1;
    const ret = (xs: number[]) => (xs[a] > 0 ? (xs[z] / xs[a] - 1) * 100 : null);
    const stockRet = ret(aligned.stock);
    const niftyRet = alignedNifty ? ret(alignedNifty) : null;
    const sectorRet = alignedSector ? ret(alignedSector) : null;
    return {
      sessions: w, label, from: aligned.dates[a], to: aligned.dates[z],
      stock: stockRet,
      nifty: niftyRet,
      vsNifty: stockRet !== null && niftyRet !== null ? stockRet - niftyRet : null,
      sector: sectorRet,
      vsSector: stockRet !== null && sectorRet !== null ? stockRet - sectorRet : null,
    };
  });
  const relObs: Observation[] = [];
  if (alignedNifty && aligned.dates.length >= 60) {
    const rsRatio = aligned.stock.map((s, i) => s / alignedNifty[i]);
    const ratioAvg = last(sma(rsRatio, 50));
    const ratioNow = rsRatio[rsRatio.length - 1];
    if (ratioAvg !== null) {
      const above = ratioNow > ratioAvg;
      relObs.push({
        id: 'rs-line',
        label: `Relative price line vs ${benchName}`,
        reading: `Stock ÷ index ratio is ${signedPct((ratioNow / ratioAvg - 1) * 100, 2)} versus its own 50-session average.`,
        interpretation: above ? `The stock has recently gained ground on the ${benchName}.` : `The stock has recently lost ground to the ${benchName}.`,
        rule: 'Daily stock close divided by the index close on matching dates, compared with the 50-session average of that ratio.',
        timeframe: 'daily', lookback: '50 matching sessions', asOf: aligned.dates[aligned.dates.length - 1],
        status: 'available', tone: above ? 'positive' : 'negative',
      });
    }
  }
  const comparison = alignedNifty ? 'vsNifty' : 'vsSector';
  const comparisonName = alignedNifty ? benchName : sectorName;
  const relAvailable = windows.filter((w) => w[comparison] !== null);
  const ahead = relAvailable.filter((w) => (w[comparison] as number) > RS_BAND).length;
  const behind = relAvailable.filter((w) => (w[comparison] as number) < -RS_BAND).length;
  const relReading = !relAvailable.length
    ? 'Insufficient data'
    : ahead === relAvailable.length
      ? `Ahead of the ${comparisonName} in all ${relAvailable.length} windows`
      : behind === relAvailable.length
        ? `Behind the ${comparisonName} in all ${relAvailable.length} windows`
        : `Mixed vs the ${comparisonName}: ahead in ${ahead}, behind in ${behind} of ${relAvailable.length}`;
  const relTone: Tone = !relAvailable.length ? 'neutral' : ahead === relAvailable.length ? 'positive' : behind === relAvailable.length ? 'negative' : 'neutral';

  /* --- Momentum ---------------------------------------------------------- */
  const r63 = n > 63 ? last(roc(closes, 63)) : null;
  const r126 = n > 126 ? last(roc(closes, 126)) : null;
  const r252 = n > 252 ? last(roc(closes, 252)) : null;
  const momentumWindows = [r63, r126, r252].filter((x): x is number => x !== null);
  const upWindows = momentumWindows.filter((x) => x > 0).length;
  const momentum: Observation[] = [];
  momentum.push({
    id: 'returns',
    label: 'Price change over 3, 6 and 12 months',
    reading: `${signedPct(r63)} · ${signedPct(r126)} · ${signedPct(r252)}`,
    interpretation: !momentumWindows.length
      ? 'Not enough history.'
      : upWindows === momentumWindows.length
        ? `Higher than ${momentumWindows.length === 3 ? '3, 6 and 12 months' : 'every available window'} ago.`
        : upWindows === 0
          ? 'Lower than every available window ago.'
          : `Higher in ${upWindows} of ${momentumWindows.length} windows.`,
    rule: 'Percentage change of the daily close over 63, 126 and 252 sessions (about 3, 6 and 12 months). Price only; dividends are not included.',
    timeframe: 'daily', lookback: '253 daily closes', asOf: stockBarDate,
    status: momentumWindows.length === 3 ? 'available' : momentumWindows.length ? 'partial' : 'insufficient',
    tone: !momentumWindows.length ? 'neutral' : upWindows === momentumWindows.length ? 'positive' : upWindows === 0 ? 'negative' : 'neutral',
  });
  const vol252 = annualVol(closes, 252);
  const niftyCloses = niftyBars?.map((b) => b.close) ?? null;
  const niftyVol = niftyCloses ? annualVol(niftyCloses, 252) : null;
  const nR126 = niftyCloses && niftyCloses.length > 126 ? last(roc(niftyCloses, 126)) : null;
  const nR252 = niftyCloses && niftyCloses.length > 252 ? last(roc(niftyCloses, 252)) : null;
  const ratio = (r: number | null, v: number | null) => (r === null || v === null || v === 0 ? null : r / v);
  const m6 = ratio(r126, vol252);
  const m12 = ratio(r252, vol252);
  const n6 = ratio(nR126, niftyVol);
  const n12 = ratio(nR252, niftyVol);
  momentum.push({
    id: 'risk-adjusted',
    label: 'Volatility-adjusted 6- and 12-month change',
    reading: `Stock ${m6 === null ? '—' : m6.toFixed(2)} · ${m12 === null ? '—' : m12.toFixed(2)}${niftyCloses ? ` (${benchName}: ${n6 === null ? '—' : n6.toFixed(2)} · ${n12 === null ? '—' : n12.toFixed(2)})` : ''}; stock volatility ${vol252 === null ? '—' : `${vol252.toFixed(1)}%`} a year.`,
    interpretation:
      m6 === null || m12 === null
        ? 'Not enough history for both windows.'
        : n6 !== null && n12 !== null
          ? m6 > n6 && m12 > n12
            ? `Higher than the ${benchName}'s ratio on both windows.`
            : m6 < n6 && m12 < n12
              ? `Lower than the ${benchName}'s ratio on both windows.`
              : `Higher than the ${benchName} on one window and lower on the other.`
          : 'No index comparison is available.',
    rule: 'Price change divided by the annualised standard deviation of daily log returns over the last 252 sessions. This follows the idea behind NSE’s Nifty200 Momentum 30 ranking (6- and 12-month returns adjusted for volatility); NSE also standardises the ratios across all eligible stocks, which a single-stock view cannot do.',
    timeframe: 'daily', lookback: '253 daily closes', asOf: stockBarDate,
    status: m6 !== null && m12 !== null ? 'available' : 'insufficient',
    tone: m6 === null || m12 === null || n6 === null || n12 === null ? 'neutral' : m6 > n6 && m12 > n12 ? 'positive' : m6 < n6 && m12 < n12 ? 'negative' : 'neutral',
  });
  const marketBelow200 = market.levels.close !== null && market.levels.sma200 !== null && market.levels.close < market.levels.sma200;
  if (marketBelow200 && upWindows > 0) {
    momentum.push({
      id: 'momentum-context',
      label: 'Research context for momentum',
      reading: `The ${benchName} is below its 200-day average.`,
      interpretation: 'Research on momentum portfolios (Daniel & Moskowitz) found the largest momentum losses clustered after market declines, when volatility was high. NIVRA has not tested this for Indian single stocks.',
      rule: `Shown when the ${benchName} closes below its 200-day simple average and the stock is up over at least one window.`,
      timeframe: 'daily', lookback: '200 index sessions', asOf: market.asOf,
      status: 'available', tone: 'caution',
    });
  }

  /* --- Price & volume structure ------------------------------------------ */
  const structure: Observation[] = [];
  const yearBars = bars.slice(-252);
  const yHigh = Math.max(...yearBars.map((b) => b.high));
  const yLow = Math.min(...yearBars.map((b) => b.low));
  const fromHigh = (close / yHigh - 1) * 100;
  const fromLow = (close / yLow - 1) * 100;
  const yPos = yHigh > yLow ? (close - yLow) / (yHigh - yLow) : null;
  const rangeLabel =
    fromHigh >= -5 ? 'Within 5% of its 52-week high' : fromLow <= 10 ? 'Within 10% of its 52-week low' : yPos !== null ? `At ${Math.round(yPos * 100)}% of its 52-week range` : 'Range unavailable';
  structure.push({
    id: '52w',
    label: '52-week range position',
    reading: `Close ${inr(close)} · high ${inr(yHigh)} (${signedPct(fromHigh)}) · low ${inr(yLow)} (${signedPct(fromLow)})`,
    interpretation: `${rangeLabel}. Being near a high or low does not establish support, resistance or persistence.`,
    rule: 'Highest high and lowest low of the last 252 daily bars, including the latest bar.',
    timeframe: 'daily', lookback: yearBars.length >= 252 ? '252 daily bars' : `${yearBars.length} daily bars (less than a year)`,
    asOf: stockBarDate, status: yearBars.length >= 252 ? 'available' : 'partial',
    tone: fromHigh >= -5 ? 'positive' : fromLow <= 10 ? 'negative' : 'neutral',
  });
  if (n >= 60) {
    const win = bars.slice(-60);
    const h = Math.max(...win.map((b) => b.high));
    const l = Math.min(...win.map((b) => b.low));
    structure.push({
      id: 'range60',
      label: '60-session range',
      reading: `${inr(l)} to ${inr(h)}: ${((h / l - 1) * 100).toFixed(1)}% wide; close at ${h > l ? Math.round(((close - l) / (h - l)) * 100) : 50}% of it.`,
      interpretation: 'Describes the recent trading range. NIVRA does not classify base or consolidation patterns.',
      rule: 'Highest high and lowest low of the last 60 daily bars; width = high ÷ low − 1.',
      timeframe: 'daily', lookback: '60 daily bars', asOf: stockBarDate, status: 'available', tone: 'neutral',
    });
  }
  const atrSeries = atr(bars, 14);
  const atrPct = atrSeries.map((v, i) => (v === null ? null : (v / closes[i]) * 100));
  const atrNow = atrPct[n - 1];
  const atrMedian = median(atrPct.slice(-252).filter((v): v is number => v !== null));
  let rangeState: 'contracting' | 'expanding' | 'typical' | null = null;
  if (atrNow !== null && atrMedian !== null && atrMedian > 0) {
    const ratioAtr = atrNow / atrMedian;
    const state = ratioAtr < 0.75 ? 'Contracting' : ratioAtr > 1.25 ? 'Expanding' : 'Typical';
    rangeState = ratioAtr < 0.75 ? 'contracting' : ratioAtr > 1.25 ? 'expanding' : 'typical';
    structure.push({
      id: 'atr-trend',
      label: 'Daily range versus its past year',
      reading: `ATR(14) ${atrNow.toFixed(2)}% of price vs a 1-year median of ${atrMedian.toFixed(2)}% (${ratioAtr.toFixed(2)}×).`,
      interpretation: state === 'Contracting' ? 'Daily ranges are narrower than usual (below 0.75× the median).' : state === 'Expanding' ? 'Daily ranges are wider than usual (above 1.25× the median).' : 'Daily ranges are within 0.75–1.25× of their usual size.',
      rule: 'Average true range over 14 sessions as a percentage of the close, compared with its median over the last 252 sessions.',
      timeframe: 'daily', lookback: '252 daily bars', asOf: stockBarDate, status: 'available', tone: 'neutral',
    });
  }
  const vols = bars.map((b) => b.volume);
  const v50 = n >= 50 ? last(sma(vols, 50)) : null;
  const v200 = n >= 200 ? last(sma(vols, 200)) : null;
  if (v50 !== null && v200 !== null && v200 > 0) {
    const r = v50 / v200;
    structure.push({
      id: 'participation',
      label: 'Participation trend',
      reading: `50-session average volume is ${r.toFixed(2)}× the 200-session average.`,
      interpretation: r > 1.2 ? 'Recent participation is above its longer-run level.' : r < 0.8 ? 'Recent participation is below its longer-run level.' : 'Recent participation is close to its longer-run level.',
      rule: 'Average daily volume over 50 sessions divided by the average over 200 sessions; above 1.2× or below 0.8× is labelled.',
      timeframe: 'daily', lookback: '200 daily bars', asOf: stockBarDate, status: 'available', tone: 'neutral',
    });
  }
  let upDownRatio: number | null = null;
  if (n >= 51) {
    let upVol = 0;
    let downVol = 0;
    for (let i = n - 50; i < n; i++) {
      if (closes[i] > closes[i - 1]) upVol += vols[i];
      else if (closes[i] < closes[i - 1]) downVol += vols[i];
    }
    if (downVol > 0 && upVol > 0) {
      upDownRatio = upVol / downVol;
      structure.push({
        id: 'updown-volume',
        label: 'Volume on up days vs down days',
        reading: `Up-day volume is ${upDownRatio.toFixed(2)}× down-day volume over the last 50 sessions.`,
        interpretation:
          upDownRatio > 1.2
            ? 'More volume traded on rising days. This is a proxy; it does not identify who bought or sold.'
            : upDownRatio < 0.83
              ? 'More volume traded on falling days. This is a proxy; it does not identify who bought or sold.'
              : 'Volume was roughly balanced between rising and falling days.',
        rule: 'Sum of volume on sessions that closed higher divided by the sum on sessions that closed lower, over 50 sessions; above 1.2 or below 0.83 is labelled.',
        timeframe: 'daily', lookback: '51 daily bars', asOf: stockBarDate, status: 'available',
        tone: upDownRatio > 1.2 ? 'positive' : upDownRatio < 0.83 ? 'negative' : 'neutral',
      });
    }
  }
  const structureReading = `${rangeLabel}${rangeState ? ` · daily ranges ${rangeState}` : ''}`;

  /* --- Patterns ---------------------------------------------------------- */
  const weekly = weeklyCandles(bars, lastBarComplete);
  const candles = {
    daily: scanCandles(bars, { timeframe: 'daily', lastBarComplete }),
    weekly: scanCandles(weekly.bars, { timeframe: 'weekly', lastBarComplete: weekly.lastComplete }),
  };
  const indicators = scanIndicatorEvents(bars, weekly, lastBarComplete);
  const allCandles = [...candles.daily.patterns, ...candles.weekly.patterns];
  const liveCandles = allCandles.filter((p) => p.status !== 'invalidated' && p.status !== 'expired');
  const pending = allCandles.filter((p) => p.status === 'awaiting' || p.status === 'forming').length;
  const datedEvents = indicators.events.filter((e) => e.kind !== 'state');
  const patternReading =
    allCandles.length || datedEvents.length
      ? `${allCandles.length} candle formation${allCandles.length === 1 ? '' : 's'}${pending ? ` (${pending} awaiting or forming)` : ''} · ${datedEvents.length} indicator event${datedEvents.length === 1 ? '' : 's'}`
      : 'No recent formations or transitions';

  /* --- Fundamentals (descriptive only) ------------------------------------ */
  const f = company.fundamentals;
  const fp = (v: number | null, d = 1) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);
  const ttm = 'Provider (Yahoo Finance) trailing figure; the reporting period and publication date are not supplied with it.';
  const items: FundamentalItem[] = [
    { label: 'Revenue growth', value: fp(f.revenueGrowth), basis: 'Provider growth field (financialData.revenueGrowth). The period is not stated in the data; it is commonly presented as the latest quarter versus the same quarter a year earlier.', available: f.revenueGrowth !== null },
    { label: 'Earnings growth', value: fp(f.earningsGrowth), basis: 'Provider growth field (financialData.earningsGrowth), same caveat as revenue growth.', available: f.earningsGrowth !== null },
    { label: 'Operating margin', value: fp(f.operatingMargin), basis: ttm, available: f.operatingMargin !== null },
    { label: 'Profit margin', value: fp(f.profitMargin), basis: ttm, available: f.profitMargin !== null },
    { label: 'Return on equity', value: fp(f.returnOnEquity), basis: ttm, available: f.returnOnEquity !== null },
    { label: 'Debt / equity', value: f.debtToEquity === null ? '—' : `${f.debtToEquity.toFixed(0)}%`, basis: 'Provider balance-sheet ratio in percent; the balance-sheet date is not supplied.', available: f.debtToEquity !== null },
    { label: 'Current ratio', value: f.currentRatio === null ? '—' : f.currentRatio.toFixed(2), basis: 'Provider balance-sheet ratio; the balance-sheet date is not supplied.', available: f.currentRatio !== null },
    { label: 'Trailing P/E', value: f.peRatio === null ? '—' : f.peRatio.toFixed(1), basis: 'Provider price ÷ trailing earnings per share. Not compared with the company’s own history or peers here.', available: f.peRatio !== null },
    { label: 'Price / book', value: f.priceToBook === null ? '—' : f.priceToBook.toFixed(2), basis: 'Provider price ÷ book value per share.', available: f.priceToBook !== null },
    { label: 'PEG ratio', value: f.pegRatio === null ? '—' : f.pegRatio.toFixed(2), basis: 'Provider-calculated; depends on analyst growth estimates.', available: f.pegRatio !== null },
    { label: 'Held by insiders', value: fp(f.promoterHolding), basis: 'Provider insider-holding field. It may approximate the promoter group but is not the exchange shareholding-pattern filing.', available: f.promoterHolding !== null },
    { label: 'Held by institutions', value: fp(f.institutionalHolding), basis: 'Provider institutional-holding field; not an exchange filing.', available: f.institutionalHolding !== null },
    { label: 'Dividend yield', value: fp(f.dividendYield, 2), basis: 'Provider trailing dividend yield.', available: f.dividendYield !== null },
  ];
  const availableItems = items.filter((i) => i.available).length;
  const rg = f.revenueGrowth;
  const eg = f.earningsGrowth;
  const growthLabel: FundamentalsContext['growthLabel'] =
    rg === null && eg === null ? 'Unknown'
      : rg === null || eg === null ? 'One field only'
        : rg > 0.05 && eg > 0.05 ? 'Growing'
          : rg < -0.05 && eg < -0.05 ? 'Contracting'
            : 'Mixed';
  const summaryUnavailable = company.dataStatus?.fundamentals === 'unavailable';
  const quarters = input.results?.quarters ?? [];
  const fundamentals: FundamentalsContext = {
    status: summaryUnavailable || availableItems === 0 ? 'unavailable' : availableItems >= 10 ? 'available' : 'partial',
    growthLabel,
    growthNote:
      'Growing = both provider growth fields above +5%; contracting = both below −5%; otherwise mixed. Whether growth is accelerating or slowing is not classified: the provider’s dated history for Indian listings is too short and, in places, inconsistent.',
    items,
    quarters,
    quartersRetrievedAt: input.results?.retrievedAt ?? null,
    unavailable: [
      'Point-in-time history of these figures (what was known on past dates), so they cannot be backtested.',
      'Valuation against the company’s own history or a sector peer group.',
      'Cash flow versus reported profit, working capital, receivables and inventory.',
      'Promoter pledges and the exchange shareholding-pattern filing.',
      'Audit qualifications, regulatory actions and related-party transactions.',
    ],
    sourceNote: summaryUnavailable
      ? 'The provider’s company summary did not load for this report, so fundamentals are unknown. Refresh to try again.'
      : 'Figures are the provider’s current snapshot. They describe the company; they do not feed the mid-term score.',
  };

  /* --- Events -------------------------------------------------------------- */
  const events: Observation[] = [];
  const e = company.earnings;
  const insideHold = e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= HOLD_CALENDAR_DAYS;
  events.push(
    e.nextDate && e.daysUntil !== null && e.daysUntil >= 0
      ? {
          id: 'next-results',
          label: 'Next results date',
          reading: `${e.nextDate} (${e.daysUntil === 0 ? 'today' : `in ${e.daysUntil} day${e.daysUntil === 1 ? '' : 's'}`}) · ${e.isEstimate ? 'provider estimate' : 'provider date, not flagged as an estimate'}`,
          interpretation: insideHold
            ? `Inside the mid engine's ${config.holdMaxDays}-session maximum hold (about 8 weeks). A results-day gap can move the price through any stop level.`
            : `Outside the ${config.holdMaxDays}-session maximum hold window.`,
          rule: `Provider earnings calendar. "Inside the hold window" means within ${HOLD_CALENDAR_DAYS} calendar days, the approximate length of ${config.holdMaxDays} sessions. Confirm dates in exchange announcements.`,
          timeframe: 'event', lookback: 'Next scheduled date', asOf: istDate(computedAt),
          status: 'available', tone: insideHold ? 'caution' : 'neutral',
        }
      : {
          id: 'next-results',
          label: 'Next results date',
          reading: 'Not supplied by the provider.',
          interpretation: 'An upcoming results date may still exist. Check the company’s exchange announcements.',
          rule: 'Provider earnings calendar.',
          timeframe: 'event', lookback: 'Next scheduled date', asOf: null, status: 'unavailable', tone: 'neutral',
        },
  );
  const latestQuarter = quarters[quarters.length - 1];
  if (latestQuarter) {
    const reported = latestQuarter.reportedAt ? istDate(latestQuarter.reportedAt) : null;
    const since = reported ? daysBetween(reported, istDate(computedAt)) : null;
    events.push({
      id: 'last-results',
      label: 'Latest reported quarter',
      reading: `Quarter ended ${latestQuarter.periodEnd ?? 'date not supplied'}; reported ${reported ?? 'date not supplied'}${since !== null && since >= 0 ? ` (${since} days ago)` : ''}; EPS ${latestQuarter.epsActual === null ? '—' : inr(latestQuarter.epsActual)}.`,
      interpretation: 'The most recent quarter in the provider’s results data. Figures should be checked against the company’s exchange filing.',
      rule: 'Provider quarterly earnings history (period end and reported date as supplied).',
      timeframe: 'event', lookback: 'Latest four quarters', asOf: reported, status: 'available', tone: 'neutral',
    });
  }

  /* --- Risk ---------------------------------------------------------------- */
  const risk: Observation[] = [];
  const flags: string[] = [];
  const v20 = annualVol(closes, 20);
  const v60 = annualVol(closes, 60);
  const atr14 = atrNow;
  risk.push({
    id: 'volatility',
    label: 'Volatility',
    reading: `Annualised: 20-session ${v20 === null ? '—' : `${v20.toFixed(1)}%`} · 60-session ${v60 === null ? '—' : `${v60.toFixed(1)}%`} · 252-session ${vol252 === null ? '—' : `${vol252.toFixed(1)}%`}. ATR(14) ${atr14 === null ? '—' : `${atr14.toFixed(2)}%`} of price.`,
    interpretation: atr14 !== null && atr14 > 4 ? 'ATR is above the 4% threshold used by the mid-term risk flag.' : 'ATR is at or below the 4% threshold used by the mid-term risk flag.',
    rule: 'Standard deviation of daily log returns × √252. ATR is the 14-session Wilder average true range divided by the close.',
    timeframe: 'daily', lookback: '20, 60 and 252 sessions', asOf: stockBarDate,
    status: vol252 !== null ? 'available' : 'partial', tone: atr14 !== null && atr14 > 4 ? 'caution' : 'neutral',
  });
  if (atr14 !== null && atr14 > 4) flags.push(`ATR is ${atr14.toFixed(1)}% of price (threshold 4%).`);

  const ddBars = bars.slice(-252);
  let peak = ddBars[0].close;
  let peakDate = ddBars[0].date;
  let maxDd = 0;
  let ddPeakDate = peakDate;
  let ddTroughDate = peakDate;
  for (const b of ddBars) {
    if (b.close > peak) { peak = b.close; peakDate = b.date; }
    const dd = (b.close / peak - 1) * 100;
    if (dd < maxDd) { maxDd = dd; ddPeakDate = peakDate; ddTroughDate = b.date; }
  }
  const yearHighClose = Math.max(...ddBars.map((b) => b.close));
  const currentDd = (close / yearHighClose - 1) * 100;
  risk.push({
    id: 'drawdown',
    label: 'Drawdown',
    reading: `Largest peak-to-trough fall in the window: ${signedPct(maxDd)} (${ddPeakDate} to ${ddTroughDate}). Now ${signedPct(currentDd)} from the window's highest close.`,
    interpretation: maxDd < -30 ? 'The past-year decline exceeded the 30% threshold. Past drawdowns do not bound future ones.' : 'Past drawdowns do not bound future ones.',
    rule: 'Running peak of daily closes; drawdown = close ÷ running peak − 1, over the last 252 sessions.',
    timeframe: 'daily', lookback: ddBars.length >= 252 ? '252 daily closes' : `${ddBars.length} daily closes`,
    asOf: stockBarDate, status: ddBars.length >= 252 ? 'available' : 'partial', tone: maxDd < -30 ? 'caution' : 'neutral',
  });
  if (maxDd < -30) flags.push(`A ${Math.abs(maxDd).toFixed(0)}% peak-to-trough fall within the last year (threshold 30%).`);

  let gaps3 = 0;
  let gaps5 = 0;
  let worstGap: { pct: number; date: string } | null = null;
  let bestGap: { pct: number; date: string } | null = null;
  let recentLargeGap: { pct: number; date: string } | null = null;
  for (let i = Math.max(1, n - 252); i < n; i++) {
    const prev = closes[i - 1];
    if (prev <= 0) continue;
    const g = (bars[i].open / prev - 1) * 100;
    if (Math.abs(g) >= 3) gaps3++;
    if (Math.abs(g) >= 5) gaps5++;
    if (!worstGap || g < worstGap.pct) worstGap = { pct: g, date: bars[i].date };
    if (!bestGap || g > bestGap.pct) bestGap = { pct: g, date: bars[i].date };
    if (i >= n - 20 && Math.abs(g) >= 5) recentLargeGap = { pct: g, date: bars[i].date };
  }
  risk.push({
    id: 'gaps',
    label: 'Overnight gaps',
    reading: `${gaps3} opening gap${gaps3 === 1 ? '' : 's'} of 3% or more (${gaps5} of 5% or more). Largest fall at the open ${worstGap ? `${signedPct(worstGap.pct)} on ${worstGap.date}` : '—'}; largest rise ${bestGap ? `${signedPct(bestGap.pct)} on ${bestGap.date}` : '—'}.`,
    interpretation: gaps5 >= 3 ? 'Frequent large gaps: at least three of 5% or more in the window. Stops cannot protect against a gap.' : 'Stops cannot protect against a gap; the next one can be larger than any shown here.',
    rule: 'Gap = session open ÷ previous close − 1.',
    timeframe: 'daily', lookback: '252 sessions', asOf: stockBarDate, status: 'available', tone: gaps5 >= 3 ? 'caution' : 'neutral',
  });
  if (gaps5 >= 3) flags.push(`${gaps5} opening gaps of 5% or more in the last year (threshold 3).`);

  if (alignedNifty && aligned.dates.length >= 121) {
    const take = Math.min(252, aligned.dates.length - 1);
    const sRet: number[] = [];
    const bRet: number[] = [];
    for (let i = aligned.dates.length - take; i < aligned.dates.length; i++) {
      sRet.push(aligned.stock[i] / aligned.stock[i - 1] - 1);
      bRet.push(alignedNifty[i] / alignedNifty[i - 1] - 1);
    }
    const ms = sRet.reduce((s, x) => s + x, 0) / sRet.length;
    const mb = bRet.reduce((s, x) => s + x, 0) / bRet.length;
    let cov = 0;
    let vs = 0;
    let vb = 0;
    for (let i = 0; i < sRet.length; i++) {
      cov += (sRet[i] - ms) * (bRet[i] - mb);
      vs += (sRet[i] - ms) ** 2;
      vb += (bRet[i] - mb) ** 2;
    }
    const beta = vb > 0 ? cov / vb : null;
    const corr = vs > 0 && vb > 0 ? cov / Math.sqrt(vs * vb) : null;
    risk.push({
      id: 'beta',
      label: `Sensitivity to the ${benchName}`,
      reading: `Beta ${beta === null ? '—' : beta.toFixed(2)} · correlation ${corr === null ? '—' : corr.toFixed(2)} over ${take} matching sessions.`,
      interpretation: beta === null ? 'Unavailable.' : `On average the stock moved about ${beta.toFixed(2)}× the index's daily move in this window. Beta changes over time and is not a forecast.`,
      rule: 'Covariance of daily stock and index returns divided by the variance of index returns, on matching dates.',
      timeframe: 'daily', lookback: `${take} matching sessions`, asOf: aligned.dates[aligned.dates.length - 1],
      status: 'available', tone: 'neutral',
    });
  }

  const traded = bars.slice(-20).map((b) => b.close * b.volume).filter((v) => v > 0);
  const medTraded = median(traded);
  if (medTraded !== null) {
    const crore = medTraded / 1e7;
    const band = crore < 1 ? 'thin' : crore < 10 ? 'moderate' : 'deep';
    risk.push({
      id: 'liquidity',
      label: 'Liquidity',
      reading: `Median daily traded value ₹${crore.toLocaleString('en-IN', { maximumFractionDigits: crore < 10 ? 2 : 0 })} crore over the last 20 sessions (this listing's exchange only).`,
      interpretation: `${band[0].toUpperCase()}${band.slice(1)} under NIVRA's bands (below ₹1 crore thin, ₹1–10 crore moderate, ₹10 crore or more deep). Thin trading widens spreads and slippage.`,
      rule: 'Median of close × volume over 20 sessions. The bands are app thresholds, not exchange definitions.',
      timeframe: 'daily', lookback: '20 sessions', asOf: stockBarDate, status: 'available', tone: band === 'thin' ? 'caution' : 'neutral',
    });
    if (band === 'thin') flags.push(`Median traded value is about ₹${crore.toFixed(2)} crore a day (threshold ₹1 crore).`);
  }

  const today = istDate(computedAt);
  const age = daysBetween(stockBarDate, today);
  const behindIndex = benchmark.lastBar !== null && stockBarDate < benchmark.lastBar;
  risk.push({
    id: 'freshness',
    label: 'Data freshness',
    reading: `Latest daily bar ${stockBarDate}${lastBarComplete === false ? ' (session in progress)' : lastBarComplete === null ? ' (completion unknown)' : ''}; ${age} calendar day${age === 1 ? '' : 's'} before ${today} (IST).${benchmark.lastBar ? ` ${benchName} latest bar ${benchmark.lastBar}.` : ''}`,
    interpretation: behindIndex
      ? 'The stock’s latest bar is older than the index’s, which can indicate a suspension, no trades or a provider gap.'
      : age > 5
        ? 'The latest bar is more than five calendar days old.'
        : 'No staleness flag. Provider prices are delayed; this is not a live quote.',
    rule: 'Compares the stock’s latest provider bar with today’s IST date and with the index’s latest bar.',
    timeframe: 'snapshot', lookback: 'Latest bar', asOf: stockBarDate, status: 'available',
    tone: behindIndex || age > 5 ? 'caution' : 'neutral',
  });
  if (behindIndex) flags.push('The stock’s latest bar is older than the index’s latest bar.');
  else if (age > 5) flags.push(`The latest bar is ${age} calendar days old.`);
  if (e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= 10) flags.push(`Results are due within 10 days (${e.nextDate}${e.isEstimate ? ', estimated' : ''}).`);

  let gapScenario: GapScenario | null = null;
  const plan = mid.tradePlan;
  if (plan && plan.stopLoss > 0 && plan.stopLoss < close && worstGap && worstGap.pct <= -0.5) {
    const plannedLossPct = ((close - plan.stopLoss) / close) * 100;
    const open = plan.stopLoss * (1 + worstGap.pct / 100);
    const scenarioLossPct = ((close - open) / close) * 100;
    gapScenario = {
      price: close,
      stop: plan.stopLoss,
      plannedLossPct,
      gapPct: worstGap.pct,
      gapDate: worstGap.date,
      scenarioLossPct,
      multiple: plannedLossPct > 0 ? scenarioLossPct / plannedLossPct : 0,
    };
  }

  /* --- Conflicts ------------------------------------------------------------ */
  const conflicts: string[] = [];
  const st = stockTrend.label;
  if (st === 'Rising' && market.label === 'Falling') conflicts.push(`The stock's primary trend is rising while the ${benchName} trend is falling.`);
  if (st === 'Falling' && market.label === 'Rising') conflicts.push(`The stock's primary trend is falling while the ${benchName} trend is rising (relative weakness).`);
  if (st === 'Rising' && sectorTrend.label === 'Falling') conflicts.push(`The stock's primary trend is rising while its sector index (${sectorName}) is falling.`);
  if (st === 'Falling' && sectorTrend.label === 'Rising') conflicts.push(`The stock's primary trend is falling while its sector index (${sectorName}) is rising.`);
  const bullishScore = mid.verdict === 'BUY' || mid.verdict === 'STRONG_BUY';
  if (bullishScore && (st === 'Mixed' || st === 'Falling')) conflicts.push(`The mid-term score has a bullish bias (${mid.score}/100), but the stricter four-check trend classification is ${st.toLowerCase()}.`);
  if (mid.verdict === 'AVOID' && st === 'Rising') conflicts.push(`The mid-term score has a bearish bias (${mid.score}/100), but all four trend checks are met.`);
  const w3 = windows[0][comparison];
  const w12 = windows[2][comparison];
  if (w3 !== null && w12 !== null && ((w3 > RS_BAND && w12 < -RS_BAND) || (w3 < -RS_BAND && w12 > RS_BAND))) {
    conflicts.push(`Over 3 months the stock is ${w3 > 0 ? 'ahead of' : 'behind'} the ${comparisonName} by ${pp(Math.abs(w3))}, but over 12 months it is ${w12 > 0 ? 'ahead' : 'behind'} by ${pp(Math.abs(w12))}.`);
  }
  const counter = liveCandles.filter((p) => (st === 'Falling' && p.direction === 'bullish') || (st === 'Rising' && p.direction === 'bearish'));
  if (counter.length) conflicts.push(`A ${counter[0].direction} ${counter[0].timeframe} formation (${counter[0].name}, ${counter[0].detectedOn}) runs against the ${st.toLowerCase()} primary trend.`);
  const activeDivergence = indicators.events.find((ev) => ev.kind === 'divergence' && ev.status === 'active' && ((st === 'Rising' && ev.direction === 'bearish') || (st === 'Falling' && ev.direction === 'bullish')));
  if (activeDivergence) conflicts.push(`${activeDivergence.name} recognised ${activeDivergence.date} within a ${st.toLowerCase()} primary trend.`);
  if (insideHold && e.nextDate) conflicts.push(`A results date (${e.nextDate}${e.isEstimate ? ', estimated' : ''}) falls inside the ${config.holdMaxDays}-session maximum hold window; a results gap can override technical levels.`);
  if (st === 'Rising' && upDownRatio !== null && upDownRatio < 0.83) conflicts.push('The trend is rising, but more volume traded on falling days than rising days over the last 50 sessions.');

  /* --- Invalidation observations -------------------------------------------- */
  const invalidation: string[] = [];
  const L = stockTrend.levels;
  if (st === 'Rising' && L.sma200 !== null && L.sma50 !== null) {
    invalidation.push(`The rising classification ends if a daily close falls below the 200-day average (now ${inr(L.sma200)}, ${signedPct((L.sma200 / close - 1) * 100)} from the latest close).`);
    invalidation.push(`It also ends if the 50-day average (${inr(L.sma50)}) falls below the 200-day, or the 200-day turns lower than it was 20 sessions earlier (${inr(L.sma200Prior)}).`);
    if (L.weeklyEma10 !== null && L.weeklyEma30 !== null) invalidation.push(`Or if the weekly close falls below the 10-week EMA (${inr(L.weeklyEma10)}) or that EMA falls below the 30-week EMA (${inr(L.weeklyEma30)}).`);
  } else if (st === 'Falling' && L.sma200 !== null && L.sma50 !== null) {
    invalidation.push(`The falling classification ends if a daily close rises above the 200-day average (now ${inr(L.sma200)}, ${signedPct((L.sma200 / close - 1) * 100)} from the latest close).`);
    invalidation.push(`It also ends if the 50-day average (${inr(L.sma50)}) rises above the 200-day, or the 200-day turns higher than it was 20 sessions earlier (${inr(L.sma200Prior)}).`);
    if (L.weeklyEma10 !== null && L.weeklyEma30 !== null) invalidation.push(`Or if the weekly close rises above the 10-week EMA (${inr(L.weeklyEma10)}) or that EMA rises above the 30-week EMA (${inr(L.weeklyEma30)}).`);
  } else if (st === 'Mixed') {
    const failing = stockTrend.checks.filter((c) => c.state !== null && c.state !== 1).map((c) => c.label.toLowerCase());
    const passing = stockTrend.checks.filter((c) => c.state === 1).map((c) => c.label.toLowerCase());
    if (failing.length) invalidation.push(`A rising classification would need every check; not currently met: ${failing.join('; ')}.`);
    if (passing.length) invalidation.push(`A falling classification would need every check to fail; currently met: ${passing.join('; ')}.`);
  }
  if (plan) {
    invalidation.push(`The mid-term model's illustrative stop is ${inr(plan.stopLoss)} (${signedPct((plan.stopLoss / close - 1) * 100)} from the latest close). It is a scenario level, not a guaranteed exit; prices can gap below it.`);
  }

  /* --- Summary rows ----------------------------------------------------------- */
  const fundamentalsReading =
    fundamentals.status === 'unavailable'
      ? 'Unavailable for this report'
      : `${growthLabel === 'One field only' ? 'Growth: one field only' : growthLabel === 'Unknown' ? 'Growth unknown' : `Growth ${growthLabel.toLowerCase()}`} · ${fundamentals.status === 'available' ? 'provider snapshot' : 'partial provider snapshot'}`;
  const eventsReading =
    e.nextDate && e.daysUntil !== null && e.daysUntil >= 0
      ? `${insideHold ? 'Results inside hold window' : 'Next results'}: ${e.nextDate}${e.isEstimate ? ' (estimated)' : ''}`
      : 'No results date from the provider';
  const summary: SummaryRow[] = [
    {
      id: 'market', title: `Market trend · ${benchName}`, reading: market.label === 'Unavailable' ? `Unavailable: ${market.note ?? ''}`.trim() : trendSummary(market),
      tone: market.tone, asOf: market.asOf ?? '—', status: market.label === 'Unavailable' ? 'unavailable' : market.label === 'Insufficient history' ? 'insufficient' : 'available',
    },
    {
      id: 'sector',
      title: input.sector.choice.index ? `Sector trend · ${sectorName}` : 'Sector trend',
      reading: !input.sector.choice.index
        ? 'No sector index mapped'
        : sectorTrend.label === 'Unavailable'
          ? 'Index data unavailable'
          : `${trendSummary(sectorTrend)}${input.sector.choice.fit === 'approximate' ? ' · approximate match' : ''}`,
      tone: sectorTrend.tone, asOf: sectorTrend.asOf ?? '—',
      status: !input.sector.choice.index || sectorTrend.label === 'Unavailable' ? 'unavailable' : sectorTrend.label === 'Insufficient history' ? 'insufficient' : 'available',
    },
    {
      id: 'trend', title: 'Stock primary trend', reading: trendSummary(stockTrend), tone: stockTrend.tone, asOf: stockBarDate,
      status: stockTrend.label === 'Insufficient history' ? 'insufficient' : 'available',
    },
    { id: 'relative', title: 'Relative strength', reading: relReading, tone: relTone, asOf: aligned.dates[aligned.dates.length - 1] ?? '—', status: relAvailable.length ? 'available' : 'insufficient' },
    {
      id: 'momentum', title: 'Momentum',
      reading: !momentumWindows.length ? 'Insufficient history' : upWindows === momentumWindows.length ? `Up over all ${momentumWindows.length} windows` : upWindows === 0 ? `Down over all ${momentumWindows.length} windows` : `Up over ${upWindows} of ${momentumWindows.length} windows`,
      tone: momentum[0].tone, asOf: stockBarDate, status: momentum[0].status,
    },
    { id: 'structure', title: 'Price and volume structure', reading: structureReading, tone: structure[0]?.tone ?? 'neutral', asOf: stockBarDate, status: 'available' },
    { id: 'patterns', title: 'Patterns and indicator events', reading: patternReading, tone: 'neutral', asOf: dates[lastComplete] ?? stockBarDate, status: 'available' },
    { id: 'fundamentals', title: 'Fundamentals', reading: fundamentalsReading, tone: 'neutral', asOf: 'Provider snapshot', status: fundamentals.status },
    { id: 'events', title: 'Events', reading: eventsReading, tone: insideHold ? 'caution' : 'neutral', asOf: 'Provider calendar', status: e.nextDate ? 'available' : 'unavailable' },
    {
      id: 'risk', title: 'Risk thresholds',
      reading: flags.length ? `${flags.length} threshold flag${flags.length === 1 ? '' : 's'}` : 'No threshold flags (losses remain possible)',
      tone: 'caution', asOf: stockBarDate, status: 'available',
    },
  ];

  return {
    version: 1,
    computedAt,
    horizon: {
      label: 'Weeks to months',
      engine: 'mid',
      signalHorizonSessions: config.signalHorizon,
      maxHoldSessions: config.holdMaxDays,
      costPct: config.costPct,
    },
    stockBarDate,
    lastBarComplete,
    benchmark,
    sector,
    summary,
    market,
    sectorTrend,
    stockTrend,
    crosses,
    relative: {
      windows,
      observations: relObs,
      note: `Price returns on matching dates${alignedSector && alignedNifty ? ` across the stock, the ${benchName} and the ${sectorName}` : ''}. Dividends are excluded for both the stock and the index (the ${benchName} here is the price index, not the total-return index). “Ahead” or “behind” needs a gap of more than ${RS_BAND} percentage point.`,
    },
    momentum,
    structure,
    candles,
    indicators,
    fundamentals,
    events: recentLargeGap
      ? [
          ...events,
          {
            id: 'recent-gap',
            label: 'Recent large gap',
            reading: `${signedPct(recentLargeGap.pct)} at the open on ${recentLargeGap.date}.`,
            interpretation: 'Large gaps often coincide with news, results or corporate actions. Check filings and news; timing alone does not establish a cause.',
            rule: 'Any opening gap of 5% or more in the last 20 sessions.',
            timeframe: 'event', lookback: '20 sessions', asOf: recentLargeGap.date, status: 'available', tone: 'caution',
          },
        ]
      : events,
    risk: { observations: risk, flags, gapScenario },
    conflicts,
    invalidation,
    limitations: [
      'These observations are not inputs to the mid-term score and have not been historically tested. They describe the setup; they are not a forecast or a recommendation.',
      'Yahoo Finance data is delayed. During market hours the latest daily bar is still forming; it is labelled and never used to confirm a pattern or crossover.',
      'Returns are price returns. Dividends are excluded for stocks and indices.',
      'Sector comparisons use the closest NSE index with provider history; some matches are approximate.',
      'Thresholds such as the 5-session crossover hold, the 1-point relative band and the liquidity bands are NIVRA’s own explicit choices, not market standards.',
    ],
  };
}
