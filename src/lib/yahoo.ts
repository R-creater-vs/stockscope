/**
 * Yahoo Finance data access for Indian equities.
 *
 * NSE symbols carry a `.NS` suffix, BSE symbols `.BO`. Yahoo's coverage of
 * Indian fundamentals is uneven — ROE and current ratio are frequently missing
 * even for large caps — so every fundamental field here is nullable by design
 * and the UI must render fine without them.
 */

import YahooFinance from 'yahoo-finance2';
import { ExtendedCookieJar } from 'yahoo-finance2/lib/cookieJar';
import type { Bar } from './indicators';
import { UNIVERSE } from './universe';
import { withDeadline, type DataRequestOptions } from './providerRequest';

const yahooOptions = {
  suppressNotices: ['yahooSurvey', 'ripHistorical'] as ('yahooSurvey' | 'ripHistorical')[],
  // Yahoo's response shape drifts for thinly-traded Indian listings (a null
  // `currency`, a missing `regularMarketPrice`). The library throws on that even
  // when the price rows themselves are fine, so we silence the logging and
  // salvage the payload from the error below.
  validation: { logErrors: false, logOptionsErrors: false, allowAdditionalProps: true },
  // Each actual HTTP exchange is abortable even for a large background study.
  // Its queue may legitimately take longer than an interactive stock request.
  fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000),
  }),
};

// A scan can enqueue an entire universe. Give user-requested reports and
// lookups their own small lane so they never sit behind those chart requests.
// Both lanes still have bounded concurrency and transport deadlines.
const yf = new YahooFinance({ ...yahooOptions, cookieJar: new ExtendedCookieJar(), queue: { concurrency: 6 } });
const interactiveYf = new YahooFinance({ ...yahooOptions, cookieJar: new ExtendedCookieJar(), queue: { concurrency: 4 } });
const clientFor = (options?: DataRequestOptions) => options?.priority === 'interactive' ? interactiveYf : yf;
const requestOptions = (signal: AbortSignal) => ({ fetchOptions: { signal } });

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/\.(ns|bo)$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** This directory supplies identity only. Prices and figures always come from Yahoo. */
function directoryMatches(query: string): SymbolMatch[] {
  const normalized = normaliseName(query);
  if (!normalized || /\.BO$/i.test(query.trim())) return [];
  const tokens = normalized.split(' ');
  return UNIVERSE.filter((entry) => {
    const text = normaliseName(`${entry.symbol.replace(/\.NS$/, '')} ${entry.name}`);
    return tokens.every((token) => text.includes(token));
  }).sort((a, b) => Number(normaliseName(b.symbol) === normalized) - Number(normaliseName(a.symbol) === normalized))
    .map(({ symbol, name }) => ({ symbol, name, exchange: 'NSE' as const }));
}

const identityCache = new Map<string, { value: SymbolMatch; at: number }>();
const IDENTITY_TTL = 24 * 60 * 60 * 1000;
function rememberIdentity(match: SymbolMatch) {
  if (identityCache.size >= 500) identityCache.delete(identityCache.keys().next().value!);
  identityCache.set(match.symbol, { value: match, at: Date.now() });
}

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
export async function searchIndian(query: string, options?: DataRequestOptions): Promise<SymbolMatch[]> {
  options?.signal?.throwIfAborted();
  const local = directoryMatches(query);
  // Common Indian names/tickers resolve instantly even during a scan. Names
  // outside this directory still use Yahoo's broader NSE/BSE search.
  if (local.length) return local.slice(0, 15);
  const res = await withDeadline((signal) => interactiveYf.search(query,
    { quotesCount: 15, newsCount: 0 }, requestOptions(signal)), 5_000, options?.signal);
  const out: SymbolMatch[] = [];

  for (const q of res.quotes ?? []) {
    const rec = q as Record<string, unknown>;
    const symbol = typeof rec.symbol === 'string' ? rec.symbol : null;
    if (!symbol) continue;
    if (rec.quoteType !== 'EQUITY') continue;
    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) continue;

    const match: SymbolMatch = {
      symbol,
      name: String(rec.shortname ?? rec.longname ?? symbol),
      exchange: symbol.endsWith('.NS') ? 'NSE' : 'BSE',
    };
    rememberIdentity(match);
    out.push(match);
  }
  return out;
}

/**
 * Turn whatever the user typed into a tradable symbol. Accepts a bare symbol
 * ("RELIANCE"), a suffixed one ("TCS.NS"), or a company name ("tata motors").
 * NSE is preferred over BSE — better liquidity, and it's what swing traders use.
 */
export async function resolveSymbol(input: string, options?: DataRequestOptions): Promise<SymbolMatch | null> {
  const raw = input.trim();
  if (!raw) return null;
  options?.signal?.throwIfAborted();
  const known = identityCache.get(raw.toUpperCase());
  if (known && Date.now() - known.at < IDENTITY_TTL) return known.value;
  const normalized = normaliseName(raw);
  const local = directoryMatches(raw);
  const exact = local.find((match) => normaliseName(match.symbol) === normalized || normaliseName(match.name) === normalized);
  if (exact) return exact;

  if (/\.(NS|BO)$/i.test(raw)) {
    const symbol = raw.toUpperCase();
    const name = await symbolName(symbol, options);
    if (name) return { symbol, name, exchange: symbol.endsWith('.NS') ? 'NSE' : 'BSE' };
  }

  // A bare all-caps word is usually already an NSE ticker; try that directly
  // before falling back to fuzzy search, which can drift to the wrong company.
  if (/^[A-Za-z&-]{2,20}$/.test(raw)) {
    const symbol = `${raw.toUpperCase()}.NS`;
    const name = await symbolName(symbol, options);
    if (name) return { symbol, name, exchange: 'NSE' };
  }

  const matches = await searchIndian(raw, options);
  return matches.find((m) => m.exchange === 'NSE') ?? matches[0] ?? null;
}

async function symbolName(symbol: string, options?: DataRequestOptions): Promise<string | null> {
  try {
    const q = await withDeadline((signal) => interactiveYf.quote(symbol, {}, requestOptions(signal)), 6_000, options?.signal);
    if (!q?.regularMarketPrice) return null;
    const name = q.longName ?? q.shortName ?? symbol;
    rememberIdentity({ symbol, name, exchange: symbol.endsWith('.NS') ? 'NSE' : 'BSE' });
    return name;
  } catch (error) {
    // A failed connection is not evidence that a company does not exist.
    options?.signal?.throwIfAborted();
    const code = (error as { code?: unknown }).code;
    if (error instanceof Error && (error.name === 'NotFoundError' || code === 404)) return null;
    throw error;
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

async function fetchBarsFor(symbol: string, span: FetchSpan, request?: DataRequestOptions): Promise<Bar[]> {
  const { period1, period2 } = spanToDates(span);

  // Only include `period2` when it exists — yahoo-finance2 validates the options
  // object and rejects an explicit `period2: undefined`, which would fail every
  // open-ended (trailing-years) fetch.
  const options = period2
    ? { period1, period2, interval: '1d' as const }
    : { period1, interval: '1d' as const };

  try {
    const chart = await withDeadline((signal) => clientFor(request).chart(symbol, options, requestOptions(signal)),
      request?.priority === 'interactive' ? 12_000 : 120_000, request?.signal);
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
  options?: DataRequestOptions,
): Promise<{ bars: Bar[]; symbol: string; switchedFrom?: string }> {
  const s: FetchSpan = typeof span === 'number' ? { years: span } : span;

  let bars: Bar[] = [];
  let originalError: unknown;
  try {
    bars = await fetchBarsFor(symbol, s, options);
  } catch (error) {
    options?.signal?.throwIfAborted();
    originalError = error;
  }

  if (bars.length >= MIN_BARS) return { bars, symbol };

  if (symbol.endsWith('.BO')) {
    const nse = `${symbol.slice(0, -3)}.NS`;
    try {
      const alt = await fetchBarsFor(nse, s, options);
      if (alt.length >= MIN_BARS) {
        return { bars: alt, symbol: nse, switchedFrom: symbol };
      }
    } catch (error) {
      options?.signal?.throwIfAborted();
      originalError ??= error;
      // Fall through and report on the original symbol.
    }
  }

  if (!bars.length && originalError) throw originalError;
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
    const chart = await withDeadline((signal) => interactiveYf.chart(symbol, { period1, interval: '5m' }, requestOptions(signal)), 12_000);
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
  /** Optional fields may be unavailable without blocking the price report. */
  dataStatus?: { fundamentals: 'available' | 'unavailable'; message?: string };
}

export async function fetchCompany(symbol: string, options?: DataRequestOptions): Promise<CompanyData> {
  const client = options?.priority === 'background' ? yf : interactiveYf;
  // Start the required quote first: Yahoo shares cookie/crumb initialization
  // within a lane, which must not inherit the shorter optional-summary timer.
  const quoteTask = withDeadline((signal) => client.quote(symbol, {}, requestOptions(signal)), 12_000, options?.signal);

  // quoteSummary is the flaky part of the API for Indian tickers — a failure
  // here should degrade the report, not kill it.
  let summaryAvailable = true;
  const summaryTask = withDeadline((signal) => client.quoteSummary(symbol, {
      modules: [
        'assetProfile',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
        'recommendationTrend',
        'calendarEvents',
      ],
    }, requestOptions(signal)), 4_000, options?.signal).catch(() => {
      summaryAvailable = false;
      return {};
    });
  const [quote, rawSummary] = await Promise.all([
    quoteTask,
    summaryTask,
  ]);
  options?.signal?.throwIfAborted();
  if (!quote?.regularMarketPrice) throw new Error(`No market data for ${symbol}`);
  const summary = rawSummary as Record<string, Record<string, unknown> | undefined>;

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
    dataStatus: summaryAvailable
      ? { fundamentals: 'available' }
      : { fundamentals: 'unavailable', message: 'Some company fundamentals, analyst data and earnings dates could not be loaded. Missing fields are unknown; refresh to try again.' },
  };
}

export interface ReportedQuarter {
  /** Fiscal period end as supplied by the provider (YYYY-MM-DD). */
  periodEnd: string | null;
  /** Publication timestamp as supplied by the provider (ISO 8601). */
  reportedAt: string | null;
  fiscalQuarter: string | null;
  calendarQuarter: string | null;
  epsActual: number | null;
  /** The provider's analyst consensus: an estimate, not a company figure. */
  epsEstimate: number | null;
}

export interface ReportedResults {
  /** Oldest first, at most four quarters. */
  quarters: ReportedQuarter[];
  currency: string | null;
  retrievedAt: string;
}

function numOf(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v && typeof v === 'object' && typeof (v as { raw?: unknown }).raw === 'number') {
    const raw = (v as { raw: number }).raw;
    return isFinite(raw) ? raw : null;
  }
  return null;
}

function isoOf(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'string' && v) d = new Date(v);
  else {
    const n = numOf(v);
    // Untransformed provider dates are epoch seconds.
    if (n !== null) d = new Date(n < 1e11 ? n * 1000 : n);
  }
  return d && !isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * Dated quarterly EPS from the provider's `earnings` module. Optional context:
 * any failure returns null and never blocks a report. Only EPS rows that carry
 * a period end or a reported date are kept. The same module's revenue and
 * earnings charts are deliberately ignored: for Indian listings they were
 * observed (22 Nov 2026) to contain zero-filled and inconsistent periods.
 */
export async function fetchReportedResults(symbol: string, options?: DataRequestOptions): Promise<ReportedResults | null> {
  const client = options?.priority === 'background' ? yf : interactiveYf;
  try {
    const raw = await withDeadline(
      (signal) => client.quoteSummary(symbol, { modules: ['earnings'] }, { validateResult: false, fetchOptions: { signal } }),
      4_000,
      options?.signal,
    );
    const earnings = (raw as { earnings?: Record<string, unknown> } | null)?.earnings;
    const chart = earnings?.earningsChart as { quarterly?: unknown } | undefined;
    const quarterly: unknown = chart?.quarterly;
    const rows: unknown[] = Array.isArray(quarterly) ? quarterly : [];
    const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
    const quarters: ReportedQuarter[] = rows
      .map((r) => {
        const row = (r ?? {}) as Record<string, unknown>;
        const actual = numOf(row.actual);
        const periodEnd = isoOf(row.periodEndDate);
        return {
          periodEnd: periodEnd ? periodEnd.slice(0, 10) : null,
          reportedAt: isoOf(row.reportedDate),
          fiscalQuarter: str(row.fiscalQuarter),
          calendarQuarter: str(row.calendarQuarter) ?? str(row.date),
          // The provider zero-fills some missing values; an exact zero is treated as unknown.
          epsActual: actual === 0 ? null : actual,
          epsEstimate: numOf(row.estimate),
        };
      })
      .filter((q) => q.epsActual !== null && (q.periodEnd !== null || q.reportedAt !== null))
      .sort((a, b) => ((a.periodEnd ?? a.reportedAt ?? '') < (b.periodEnd ?? b.reportedAt ?? '') ? -1 : 1));
    if (!quarters.length) return null;
    return {
      quarters: quarters.slice(-4),
      currency: str(earnings?.financialCurrency),
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    options?.signal?.throwIfAborted();
    return null;
  }
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
