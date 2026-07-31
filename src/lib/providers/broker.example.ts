/**
 * TEMPLATE — a real-time broker data provider. Not wired in; nothing imports it.
 *
 * This is the file to copy when you get a broker API key. All three of Dhan,
 * Angel One SmartAPI and Upstox are free with a demat account and give live
 * NSE/BSE quotes and proper historical candles. Fill in the four methods below,
 * then flip the switch in `provider.ts` (`activeProvider()`), and the entire app
 * upgrades to real-time — the swing engine, screener, charts and watchlist all
 * keep working unchanged, because they only ever see the `DataProvider`
 * interface.
 *
 * Getting a key (pick one):
 *   - Dhan:     https://dhanhq.co/  → Profile → DhanHQ Trading APIs (access token)
 *   - Angel One: https://smartapi.angelbroking.com/  → create app → API key + TOTP
 *   - Upstox:   https://upstox.com/developer/  → create app → OAuth access token
 *
 * Put the token in `.env.local` (never commit it), e.g. DHAN_ACCESS_TOKEN=...
 * and read it in `activeProvider()`.
 */

/* eslint-disable @typescript-eslint/no-unused-vars -- intentional stub: params
   document the signatures a real implementation must fill in. */

import type { Bar } from '../indicators';
import type { CompanyData, FetchSpan, SymbolMatch } from '../yahoo';
import type { DataProvider } from './provider';

export function createBrokerProvider(accessToken: string): DataProvider {
  // A real implementation would create an authenticated HTTP client here:
  //
  //   const client = new DhanClient({ accessToken });

  return {
    name: 'Dhan (real-time)', // shown in the UI
    realtime: true,

    async searchIndian(_query: string): Promise<SymbolMatch[]> {
      // Brokers ship a downloadable instrument master (CSV of every tradable
      // symbol). Load it once, then filter by name/symbol here.
      throw new Error('Not implemented — map the broker instrument master to SymbolMatch[].');
    },

    async resolveSymbol(_input: string): Promise<SymbolMatch | null> {
      // Resolve a name or ticker to the broker's security id. Prefer NSE.
      throw new Error('Not implemented — resolve to the broker security id.');
    },

    async fetchBars(
      _symbol: string,
      _span: number | FetchSpan = 2,
    ): Promise<{ bars: Bar[]; symbol: string; switchedFrom?: string }> {
      // Call the broker's historical-candle endpoint and map each candle to the
      // `Bar` shape: { date: 'yyyy-mm-dd', open, high, low, close, volume }.
      // `_span` is either a trailing year count or an explicit { from, to } range
      // (used by historical backtests). The swing engine needs ≥60 daily bars.
      throw new Error('Not implemented — map broker candles to Bar[].');
    },

    async fetchCompany(_symbol: string): Promise<CompanyData> {
      // Brokers give live quotes but usually NOT fundamentals/analyst data.
      // The pragmatic pattern: take price/quote from the broker (real-time) and
      // keep fundamentals from Yahoo. i.e. a hybrid provider. Fundamentals do
      // not feed the swing score, so stale-by-a-day is fine there.
      throw new Error('Not implemented — combine broker quote with fundamentals source.');
    },
  };
}
