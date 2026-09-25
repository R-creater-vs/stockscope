/**
 * Public data API. Import data functions from here, not from `../yahoo`, so the
 * underlying provider can change without touching callers.
 */

export type { DataProvider } from './provider';
export type { DataRequestOptions } from '../providerRequest';
export {
  activeProvider,
  fetchBars,
  fetchCompany,
  resolveSymbol,
  searchIndian,
} from './provider';

// Types describing the data shapes still live with the reference (Yahoo)
// implementation; re-exported here so callers have one import site.
export type {
  AnalystView,
  CompanyData,
  Earnings,
  FetchSpan,
  Fundamentals,
  Profile,
  Quote,
  SymbolMatch,
} from '../yahoo';
