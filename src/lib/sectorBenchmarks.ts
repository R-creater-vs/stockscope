/**
 * Chooses the sector index a stock is compared against. Pure: no I/O.
 *
 * The index symbols below were checked on 2026-11-22 to return roughly two
 * years of daily history from the active provider (Yahoo Finance). Several NSE
 * indices that exist (Nifty Media, Commodities, Healthcare, Oil & Gas, Consumer
 * Durables, Services) returned only a single bar there, so they are not used:
 * a benchmark without history would silently produce a meaningless comparison.
 *
 * A mapping is labelled `direct` when the index tracks the stock's own sector,
 * and `approximate` when it is the closest broad index that contains it. Some
 * sectors have no honest match; those return no benchmark and say why.
 */

import { UNIVERSE } from './universe';

export interface BenchmarkIndex {
  symbol: string;
  name: string;
}

export interface SectorBenchmarkChoice {
  /** The sector label used for the decision (app universe label or provider sector). */
  sectorLabel: string | null;
  index: BenchmarkIndex | null;
  fit: 'direct' | 'approximate' | null;
  /** Plain-language reason for the choice, or for the absence of a benchmark. */
  basis: string;
}

export const BROAD_BENCHMARK: BenchmarkIndex = { symbol: '^NSEI', name: 'Nifty 50' };

const INDEX = {
  bank: { symbol: '^NSEBANK', name: 'Nifty Bank' },
  finance: { symbol: 'NIFTY_FIN_SERVICE.NS', name: 'Nifty Financial Services' },
  it: { symbol: '^CNXIT', name: 'Nifty IT' },
  auto: { symbol: '^CNXAUTO', name: 'Nifty Auto' },
  pharma: { symbol: '^CNXPHARMA', name: 'Nifty Pharma' },
  fmcg: { symbol: '^CNXFMCG', name: 'Nifty FMCG' },
  metal: { symbol: '^CNXMETAL', name: 'Nifty Metal' },
  energy: { symbol: '^CNXENERGY', name: 'Nifty Energy' },
  realty: { symbol: '^CNXREALTY', name: 'Nifty Realty' },
  infra: { symbol: '^CNXINFRA', name: 'Nifty Infrastructure' },
  consumption: { symbol: '^CNXCONSUM', name: 'Nifty India Consumption' },
} satisfies Record<string, BenchmarkIndex>;

function pick(
  sectorLabel: string | null,
  index: BenchmarkIndex | null,
  fit: 'direct' | 'approximate' | null,
  basis: string,
): SectorBenchmarkChoice {
  return { sectorLabel, index, fit, basis };
}

function universeSector(symbol: string): string | null {
  const nse = symbol.toUpperCase().replace(/\.BO$/, '.NS');
  return UNIVERSE.find((entry) => entry.symbol === nse)?.sector ?? null;
}

/**
 * The app's curated universe label wins when the stock is in it, because the
 * provider's sector field is missing for some Indian listings. The provider
 * industry still refines Financials (bank vs non-bank) when it is available.
 */
export function chooseSectorBenchmark(input: {
  symbol: string;
  sector: string | null;
  industry: string | null;
}): SectorBenchmarkChoice {
  const industry = input.industry ?? '';
  const label = universeSector(input.symbol);

  if (label) {
    switch (label) {
      case 'Financials':
        if (/bank/i.test(industry)) return pick(label, INDEX.bank, 'direct', `Financials stock whose provider industry is “${industry}”.`);
        if (industry) return pick(label, INDEX.finance, 'direct', `Non-bank financial stock (provider industry “${industry}”).`);
        return pick(label, INDEX.finance, 'approximate', 'Financials stock; the provider industry was unavailable, so the broader financial-services index is used.');
      case 'Technology':
        return /information technology|software/i.test(industry)
          ? pick(label, INDEX.it, 'direct', 'Technology stock in IT services or software.')
          : pick(label, INDEX.it, 'approximate', 'Technology stock outside IT services; the IT index is the closest available sector index.');
      case 'Auto':
        return pick(label, INDEX.auto, 'direct', 'Automobile or auto-component stock.');
      case 'Pharma':
        return /drug|pharma|biotech/i.test(industry)
          ? pick(label, INDEX.pharma, 'direct', 'Pharmaceutical stock.')
          : pick(label, INDEX.pharma, 'approximate', 'Healthcare stock outside drug manufacturing; the Nifty Healthcare series is unavailable from the provider.');
      case 'FMCG':
        return pick(label, INDEX.fmcg, 'direct', 'Fast-moving consumer goods stock.');
      case 'Metals':
        return pick(label, INDEX.metal, 'direct', 'Metals or mining stock.');
      case 'Energy':
        return pick(label, INDEX.energy, 'direct', 'Oil, gas or energy stock.');
      case 'Utilities':
        return pick(label, INDEX.energy, 'approximate', 'Power utility; the Nifty Energy index includes power companies.');
      case 'Realty':
        return pick(label, INDEX.realty, 'direct', 'Real-estate stock.');
      case 'Consumer':
        return pick(label, INDEX.consumption, 'approximate', 'Consumer-facing stock; Nifty India Consumption is a broad consumption index.');
      case 'Industrials':
        return pick(label, INDEX.infra, 'approximate', 'Industrial or capital-goods stock; Nifty Infrastructure is the closest broad index with provider history.');
      case 'Telecom':
        return pick(label, INDEX.infra, 'approximate', 'Telecom stock; telecom companies are part of the broad Nifty Infrastructure index.');
      case 'Materials':
        return pick(label, null, null, 'No sector index with provider history matches cement, chemicals or fertilisers closely; the Nifty Commodities series is unavailable from the provider.');
      case 'Media':
        return pick(label, null, null, 'The Nifty Media series is unavailable from the provider.');
      default:
        return pick(label, null, null, `No sector index is mapped for “${label}”.`);
    }
  }

  const sector = input.sector;
  if (!sector && !industry) return pick(null, null, null, 'The provider did not supply a sector or industry for this listing.');
  if (/bank/i.test(industry)) return pick(sector, INDEX.bank, 'direct', `Provider industry “${industry}”.`);
  switch (sector) {
    case 'Financial Services':
      return pick(sector, INDEX.finance, 'direct', `Provider sector “${sector}”${industry ? `, industry “${industry}”` : ''}.`);
    case 'Technology':
      return /information technology|software/i.test(industry)
        ? pick(sector, INDEX.it, 'direct', `Provider industry “${industry}”.`)
        : pick(sector, INDEX.it, 'approximate', `Provider sector “${sector}”${industry ? ` (industry “${industry}”)` : ''}; the IT index is the closest available.`);
    case 'Healthcare':
      return /drug|pharma|biotech/i.test(industry)
        ? pick(sector, INDEX.pharma, 'direct', `Provider industry “${industry}”.`)
        : pick(sector, INDEX.pharma, 'approximate', `Provider sector “${sector}”; the Nifty Healthcare series is unavailable from the provider.`);
    case 'Consumer Defensive':
      return pick(sector, INDEX.fmcg, 'direct', `Provider sector “${sector}”.`);
    case 'Consumer Cyclical':
      return /auto/i.test(industry)
        ? pick(sector, INDEX.auto, 'direct', `Provider industry “${industry}”.`)
        : pick(sector, INDEX.consumption, 'approximate', `Provider sector “${sector}”${industry ? ` (industry “${industry}”)` : ''}.`);
    case 'Basic Materials':
      return /steel|alumin|copper|zinc|metal|mining/i.test(industry)
        ? pick(sector, INDEX.metal, 'direct', `Provider industry “${industry}”.`)
        : pick(sector, null, null, `Provider industry “${industry || 'unknown'}” has no closely matching sector index with provider history.`);
    case 'Energy':
      return pick(sector, INDEX.energy, 'direct', `Provider sector “${sector}”.`);
    case 'Utilities':
      return pick(sector, INDEX.energy, 'approximate', 'Utility; the Nifty Energy index includes power companies.');
    case 'Real Estate':
      return pick(sector, INDEX.realty, 'direct', `Provider sector “${sector}”.`);
    case 'Industrials':
      return pick(sector, INDEX.infra, 'approximate', `Provider sector “${sector}”; Nifty Infrastructure is the closest broad index with provider history.`);
    case 'Communication Services':
      return /telecom/i.test(industry)
        ? pick(sector, INDEX.infra, 'approximate', 'Telecom services; telecom companies are part of the broad Nifty Infrastructure index.')
        : pick(sector, null, null, 'Media and internet services have no sector index with provider history.');
    default:
      return pick(sector, null, null, `No sector index is mapped for provider sector “${sector ?? 'unknown'}”.`);
  }
}
