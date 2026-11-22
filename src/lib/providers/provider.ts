/**
 * The data-source seam.
 *
 * Everything above the data layer — the swing engine, screener, routes, UI —
 * talks to this interface, never to Yahoo directly. Swapping in a real-time
 * broker feed (Dhan, Angel One SmartAPI, Upstox) is then a matter of writing one
 * more implementation of `DataProvider` and pointing `activeProvider()` at it.
 * Nothing else changes.
 *
 * The default is Yahoo, which needs no API key. A broker provider is selected
 * only when its key is present in the environment, so the app runs fully without
 * one — the real-time path is dormant, not required.
 */

import type { Bar } from '../indicators';
import type { CompanyData, FetchSpan, ReportedResults, SymbolMatch } from '../yahoo';
import type { DataRequestOptions } from '../providerRequest';

export interface DataProvider {
  /** Human-readable name, surfaced in the UI so users know where data came from. */
  readonly name: string;
  /** True when this feed is intraday/live rather than delayed end-of-day. */
  readonly realtime: boolean;

  searchIndian(query: string, options?: DataRequestOptions): Promise<SymbolMatch[]>;
  resolveSymbol(input: string, options?: DataRequestOptions): Promise<SymbolMatch | null>;
  fetchBars(
    symbol: string,
    span?: number | FetchSpan,
    options?: DataRequestOptions,
  ): Promise<{ bars: Bar[]; symbol: string; switchedFrom?: string }>;
  fetchCompany(symbol: string, options?: DataRequestOptions): Promise<CompanyData>;
  /**
   * Optional dated quarterly results. A provider without this capability is
   * still complete: callers treat a missing method or a null result as
   * "unavailable", never as zero.
   */
  fetchReportedResults?(symbol: string, options?: DataRequestOptions): Promise<ReportedResults | null>;
}

let cached: DataProvider | null = null;

/**
 * Pick the provider for this process. Add a broker branch here once you have a
 * key — see `broker.example.ts` for a complete template. The choice is cached so
 * a provider can hold a session/token without re-authenticating per request.
 */
export function activeProvider(): DataProvider {
  if (cached) return cached;

  // Example of how a real-time feed would switch on automatically once
  // configured. Left commented because no key is present:
  //
  //   if (process.env.DHAN_ACCESS_TOKEN) {
  //     cached = createDhanProvider(process.env.DHAN_ACCESS_TOKEN);
  //     return cached;
  //   }

  cached = yahooProvider;
  return cached;
}

/* --------------------------------------------------------- Yahoo (default) */

import {
  fetchBars as yfBars,
  fetchCompany as yfCompany,
  fetchReportedResults as yfResults,
  resolveSymbol as yfResolve,
  searchIndian as yfSearch,
} from '../yahoo';

const yahooProvider: DataProvider = {
  name: 'Yahoo Finance',
  realtime: false,
  searchIndian: yfSearch,
  resolveSymbol: yfResolve,
  fetchBars: yfBars,
  fetchCompany: yfCompany,
  fetchReportedResults: yfResults,
};

/* ---------------------------------------------------- convenience delegates */
/* So callers can `import { fetchBars } from '@/lib/providers'` and stay unaware
   of which provider is live. */

export const searchIndian: DataProvider['searchIndian'] = (q, options) => activeProvider().searchIndian(q, options);
export const resolveSymbol: DataProvider['resolveSymbol'] = (i, options) => activeProvider().resolveSymbol(i, options);
export const fetchBars: DataProvider['fetchBars'] = (s, span, options) => activeProvider().fetchBars(s, span, options);
export const fetchCompany: DataProvider['fetchCompany'] = (s, options) => activeProvider().fetchCompany(s, options);
export const fetchReportedResults = (s: string, options?: DataRequestOptions): Promise<ReportedResults | null> => {
  const provider = activeProvider();
  return provider.fetchReportedResults ? provider.fetchReportedResults(s, options) : Promise.resolve(null);
};
