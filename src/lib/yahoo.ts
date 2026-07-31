/**
 * Yahoo Finance data access for Indian equities.
 *
 * NSE symbols carry a `.NS` suffix, BSE symbols `.BO`. Yahoo's coverage of
 * Indian fundamentals is uneven — ROE and current ratio are frequently missing
 * even for large caps — so every fundamental field here is nullable by design
 * and the UI must render fine without them.
 */

import YahooFinance from 'yahoo-finance2';
import type { Bar } from './indicators';

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  // Yahoo's response shape drifts for thinly-traded Indian listings (a null
  // `currency`, a missing `regularMarketPrice`). The library throws on that even
  // when the price rows themselves are fine, so we silence the logging and
  // salvage the payload from the error below.
  validation: { logErrors: false, logOptionsErrors: false, allowAdditionalProps: true },
  // The screener fetches ~130 series per scan; the default of 4 makes that
  // needlessly slow, and 8 stays comfortably under Yahoo's rate limiting.
  queue: { concurrency: 8 },
});

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
}

export interface Profile {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  summary: string | null;
  website: string | null;
  employees: number | null;
}

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  marketState: string | null;
}

export interface Fundamentals {
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  bookValue: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  promoterHolding: number | null;
  institutionalHolding: number | null;
}

export interface AnalystView {
  recommendation: string | null;
  numberOfAnalysts: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/** Only Indian listings — everything else is noise for this app. */
export async function searchIndian(query: string): Promise<SymbolMatch[]> {
  const res = await yf.search(query, { quotesCount: 15, newsCount: 0 });
  const out: SymbolMatch[] = [];

  for (const q of res.quotes ?? []) {
    const rec = q as Record<string, unknown>;
    const symbol = typeof rec.symbol === 'string' ? rec.symbol : null;
    if (!symbol) continue;
    if (rec.quoteType !== 'EQUITY') continue;
    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) continue;

    out.push({
      symbol,
      name: String(rec.shortname ?? rec.longname ?? symbol),
      exchange: symbol.endsWith('.NS') ? 'NSE' : 'BSE',
    });
  }
  return out;
}

/**
 * Turn whatever the user typed into a tradable symbol. Accepts a bare symbol
 * ("RELIANCE"), a suffixed one ("TCS.NS"), or a company name ("tata motors").
 * NSE is preferred over BSE — better liquidity, and it's what swing traders use.
 */
export async function resolveSymbol(input: string): Promise<SymbolMatch | null> {
  const raw = input.trim();
  if (!raw) return null;

  if (/\.(NS|BO)$/i.test(raw)) {
    const symbol = raw.toUpperCase();
    const name = await symbolName(symbol);
    if (name) return { symbol, name, exchange: symbol.endsWith('.NS') ? 'NSE' : 'BSE' };
  }

  // A bare all-caps word is usually already an NSE ticker; try that directly
  // before falling back to fuzzy search, which can drift to the wrong company.
  if (/^[A-Za-z&-]{2,20}$/.test(raw)) {
    const symbol = `${raw.toUpperCase()}.NS`;
    const name = await symbolName(symbol);
    if (name) return { symbol, name, exchange: 'NSE' };
  }

  const matches = await searchIndian(raw);
  return matches.find((m) => m.exchange === 'NSE') ?? matches[0] ?? null;
}

async function symbolName(symbol: string): Promise<string | null> {
  try {
    const q = await yf.quote(symbol);
    if (!q?.regularMarketPrice) return null;
    return q.longName ?? q.shortName ?? symbol;
  } catch {
    return null;
  }
}

interface RawQuoteRow {
  date: Date | string | number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/**
 * When schema validation fails, the thrown error still carries the parsed body.
 * The failures we see are in `meta` (a null currency), not in the price rows —
 * so recovering the rows gives a correct chart where the library would give none.
 */
function salvageQuotes(err: unknown): RawQuoteRow[] | null {
  const result = (err as { result?: unknown })?.result;
  if (!result || typeof result !== 'object') return null;
  const quotes = (result as { quotes?: unknown }).quotes;
  return Array.isArray(quotes) ? (quotes as RawQuoteRow[]) : null;
}

function toBars(rows: RawQuoteRow[]): Bar[] {
  return rows
    .filter(
      (q) =>
        q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null,
    )
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: q.volume as number,
    }));
}

/**
 * A fetch span. Callers pass either `{ years }` (trailing window ending today)
 * or an explicit `{ from, to }` range. The explicit range matters for backtest
 * windows years in the past: requesting the *whole* history back to that window
 * (nine years for a 2019 study) is a large payload that Yahoo rate-limits under
 * universe-wide load, dropping most stocks. A bounded range fetches only what
 * the window needs and keeps coverage high.
 */
export interface FetchSpan {
  years?: number;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
}

function spanToDates(span: FetchSpan): { period1: Date; period2?: Date } {
  if (span.from) {
    return { period1: new Date(span.from), period2: span.to ? new Date(span.to) : undefined };
  }
  const from = new Date();
  from.setFullYear(from.getFullYear() - (span.years ?? 2));
  return { period1: from };
}

async function fetchBarsFor(symbol: string, span: FetchSpan): Promise<Bar[]> {
  const { period1, period2 } = spanToDates(span);

  // Only include `period2` when it exists — yahoo-finance2 validates the options
  // object and rejects an explicit `period2: undefined`, which would fail every
  // open-ended (trailing-years) fetch.
  const options = period2
    ? { period1, period2, interval: '1d' as const }
    : { period1, interval: '1d' as const };

  try {
    const chart = await yf.chart(symbol, options);
    return toBars((chart.quotes ?? []) as RawQuoteRow[]);
  } catch (err) {
    const salvaged = salvageQuotes(err);
    if (salvaged) return toBars(salvaged);
    throw err;
  }
}

/** Minimum bars for a meaningful 50-EMA, ADX and squeeze percentile. */
const MIN_BARS = 60;

/**
 * Fetch daily bars, falling back from BSE to NSE when Yahoo's BSE series is
 * broken — which is common. `RELIANCE.BO` returns 5 rows where `RELIANCE.NS`
 * returns 500. NSE is the more liquid venue anyway, so the swap is a strict
 * improvement rather than a compromise.
 *
 * The second argument is a trailing year count (the common case) or an explicit
 * `{ from, to }` span for historical backtest windows.
 */
export async function fetchBars(
  symbol: string,
  span: number | FetchSpan = 2,
): Promise<{ bars: Bar[]; symbol: string; switchedFrom?: string }> {
  const s: FetchSpan = typeof span === 'number' ? { years: span } : span;

  let bars: Bar[] = [];
  try {
    bars = await fetchBarsFor(symbol, s);
  } catch {
    bars = [];
  }

  if (bars.length >= MIN_BARS) return { bars, symbol };

  if (symbol.endsWith('.BO')) {
    const nse = `${symbol.slice(0, -3)}.NS`;
    try {
      const alt = await fetchBarsFor(nse, s);
      if (alt.length >= MIN_BARS) {
        return { bars: alt, symbol: nse, switchedFrom: symbol };
      }
    } catch {
      // Fall through and report on the original symbol.
    }
  }

  return { bars, symbol };
}

/* ---------------------------------------------------------- intraday */

export interface IntradayPoint {
  t: number; // epoch ms
  p: number; // price
}

export interface Intraday {
  symbol: string;
  points: IntradayPoint[];
  /** The close before this session — the baseline for the day's change. */
  prevClose: number | null;
  /** YYYY-MM-DD of the session shown (the latest one Yahoo has). */
  sessionDate: string | null;
}

/**
 * The latest trading session's intraday price line (5-minute bars). This is REAL
 * data, just Yahoo-delayed (~15 min) — which for a weeks-to-weeks swing trader is
 * more than fresh enough. We pull a few days and keep the most recent session so
 * the chart still shows something over weekends and holidays.
 */
export async function fetchIntraday(symbol: string): Promise<Intraday> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - 5);

  let quotes: RawQuoteRow[] = [];
  let meta: Record<string, unknown> = {};
  try {
    const chart = await yf.chart(symbol, { period1, interval: '5m' });
    quotes = (chart.quotes ?? []) as RawQuoteRow[];
    meta = (chart.meta ?? {}) as unknown as Record<string, unknown>;
  } catch (err) {
    const salvaged = salvageQuotes(err);
    if (salvaged) quotes = salvaged;
    const result = (err as { result?: { meta?: Record<string, unknown> } })?.result;
    if (result?.meta) meta = result.meta;
  }

  const all = quotes
    .filter((q) => q.close != null)
    .map((q) => ({ t: new Date(q.date).getTime(), p: q.close as number }));

  // Keep only the most recent session. Group by UTC date — the NSE session
  // (03:45–10:00 UTC) never crosses UTC midnight, so this cleanly isolates a day.
  let points = all;
  if (all.length) {
    const lastDay = new Date(all[all.length - 1].t).toISOString().slice(0, 10);
    points = all.filter((pt) => new Date(pt.t).toISOString().slice(0, 10) === lastDay);
  }

  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
  const prevClose = num(meta.chartPreviousClose) ?? num(meta.previousClose);
  const sessionDate = points.length
    ? new Date(points[points.length - 1].t).toISOString().slice(0, 10)
    : null;

  return { symbol, points, prevClose, sessionDate };
}

export interface Earnings {
  /** Next results date (ISO yyyy-mm-dd), or null if unknown. */
  nextDate: string | null;
  /** Yahoo flags estimated dates — an estimate is worth less than a confirmed one. */
  isEstimate: boolean;
  /** Whole days from today until results; negative once the date has passed. */
  daysUntil: number | null;
}

export interface CompanyData {
  profile: Profile;
  quote: Quote;
  fundamentals: Fundamentals;
  analyst: AnalystView;
  earnings: Earnings;
}

export async function fetchCompany(symbol: string): Promise<CompanyData> {
  const quote = await yf.quote(symbol);
  if (!quote?.regularMarketPrice) throw new Error(`No market data for ${symbol}`);

  // quoteSummary is the flaky part of the API for Indian tickers — a failure
  // here should degrade the report, not kill it.
  let summary: Record<string, Record<string, unknown> | undefined> = {};
  try {
    summary = (await yf.quoteSummary(symbol, {
      modules: [
        'assetProfile',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
        'recommendationTrend',
        'calendarEvents',
      ],
    })) as unknown as Record<string, Record<string, unknown> | undefined>;
  } catch {
    summary = {};
  }

  const asset = summary.assetProfile ?? {};
  const detail = summary.summaryDetail ?? {};
  const stats = summary.defaultKeyStatistics ?? {};
  const fin = summary.financialData ?? {};
  const trendRoot = summary.recommendationTrend as { trend?: Record<string, number>[] } | undefined;
  const trend = trendRoot?.trend?.[0] ?? {};
  const calendar = summary.calendarEvents as
    | { earnings?: { earningsDate?: unknown; isEarningsDateEstimate?: unknown } }
    | undefined;

  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

  return {
    profile: {
      symbol,
      name: quote.longName ?? quote.shortName ?? symbol,
      exchange: quote.fullExchangeName ?? (symbol.endsWith('.NS') ? 'NSE' : 'BSE'),
      currency: quote.currency ?? 'INR',
      sector: str(asset.sector),
      industry: str(asset.industry),
      summary: str(asset.longBusinessSummary),
      website: str(asset.website),
      employees: num(asset.fullTimeEmployees),
    },
    quote: {
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      previousClose: num(quote.regularMarketPreviousClose),
      dayHigh: num(quote.regularMarketDayHigh),
      dayLow: num(quote.regularMarketDayLow),
      volume: num(quote.regularMarketVolume),
      marketCap: num(quote.marketCap),
      marketState: quote.marketState ?? null,
    },
    fundamentals: {
      peRatio: num(quote.trailingPE),
      forwardPE: num(quote.forwardPE),
      pegRatio: num(stats.pegRatio),
      priceToBook: num(quote.priceToBook),
      bookValue: num(quote.bookValue),
      eps: num(quote.epsTrailingTwelveMonths),
      dividendYield: num(detail.dividendYield),
      beta: num(stats.beta),
      returnOnEquity: num(fin.returnOnEquity),
      debtToEquity: num(fin.debtToEquity),
      currentRatio: num(fin.currentRatio),
      operatingMargin: num(fin.operatingMargins),
      profitMargin: num(fin.profitMargins),
      revenueGrowth: num(fin.revenueGrowth),
      earningsGrowth: num(fin.earningsGrowth),
      promoterHolding: num(stats.heldPercentInsiders),
      institutionalHolding: num(stats.heldPercentInstitutions),
    },
    analyst: {
      recommendation: str(fin.recommendationKey),
      numberOfAnalysts: num(fin.numberOfAnalystOpinions),
      targetMean: num(fin.targetMeanPrice),
      targetHigh: num(fin.targetHighPrice),
      targetLow: num(fin.targetLowPrice),
      strongBuy: trend.strongBuy ?? 0,
      buy: trend.buy ?? 0,
      hold: trend.hold ?? 0,
      sell: trend.sell ?? 0,
      strongSell: trend.strongSell ?? 0,
    },
    earnings: parseEarnings(calendar),
  };
}

/**
 * Next-earnings date from Yahoo's calendar. Holding a swing position through
 * results is a gap risk, not a trade — so the report surfaces this prominently
 * rather than burying it. `earningsDate` is an array (Yahoo gives a window when
 * unconfirmed); we take the earliest.
 */
function parseEarnings(
  calendar: { earnings?: { earningsDate?: unknown; isEarningsDateEstimate?: unknown } } | undefined,
): Earnings {
  const dates = calendar?.earnings?.earningsDate;
  const first = Array.isArray(dates) ? dates[0] : dates;
  const parsed = first ? new Date(first as string | number | Date) : null;

  if (!parsed || isNaN(parsed.getTime())) {
    return { nextDate: null, isEstimate: false, daysUntil: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  return {
    nextDate: parsed.toISOString().slice(0, 10),
    isEstimate: calendar?.earnings?.isEarningsDateEstimate === true,
    daysUntil,
  };
}
