import { NextRequest, NextResponse } from 'next/server';
import { analyzeSwing } from '@/lib/swing';
import { analyzeAllTimeframes } from '@/lib/multiTimeframe';
import { buildNarrative } from '@/lib/narrative';
import { fetchBars, fetchCompany, fetchReportedResults, resolveSymbol } from '@/lib/providers';
import { ProviderTimeoutError, withDeadline } from '@/lib/providerRequest';
import { benchmarkBars, prefetchBenchmark, type BenchmarkResult } from '@/lib/benchmarks';
import { BROAD_BENCHMARK, chooseSectorBenchmark } from '@/lib/sectorBenchmarks';
import { buildPositionEvidence, type PositionEvidence } from '@/lib/positionEvidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** In-process cache. Yahoo rate-limits aggressively; a short TTL keeps us under it. */
const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query) {
    return NextResponse.json({ error: 'Enter a stock name or symbol.' }, { status: 400 });
  }

  // An explicit refresh (?fresh=1) skips the read side of the cache so the user
  // gets genuinely re-pulled data. We still WRITE the cache below, so a fresh
  // pull also warms it for subsequent normal navigation.
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';

  const useAI = req.nextUrl.searchParams.get('narrative') === 'ai';
  const key = `${query.toUpperCase()}:${useAI ? 'ai' : 'rules'}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload);
  }

  try {
    return await withDeadline(async (signal) => {
      const options = { signal, priority: 'interactive' as const };
      const match = await resolveSymbol(query, options);
      if (!match) {
        return NextResponse.json(
          { error: `Could not find an NSE or BSE listing for "${query}". Try the exact ticker, e.g. TCS or INFY.` },
          { status: 404 },
        );
      }
      const canonicalHit = cache.get(`${match.symbol}:${useAI ? 'ai' : 'rules'}`);
      if (!fresh && canonicalHit && Date.now() - canonicalHit.at < TTL_MS) {
        return NextResponse.json(canonicalHit.payload);
      }

      // Price history and company data are independent for the requested listing.
      // Capture company failures immediately, including if BSE later falls back.
      const companyTask = fetchCompany(match.symbol, options).then(
        (company) => ({ company, error: undefined }),
        (error: unknown) => ({ company: undefined, error }),
      );
      // Weeks-to-months context runs alongside the required work. Each part is
      // optional, has its own short deadline and never fails the report.
      const resultsTask = fetchReportedResults(match.symbol, options).catch(() => null);
      const niftyTask = benchmarkBars(BROAD_BENCHMARK.symbol, signal);
      const earlySector = chooseSectorBenchmark({ symbol: match.symbol, sector: null, industry: null });
      if (earlySector.index) prefetchBenchmark(earlySector.index.symbol);
      const { bars, symbol, switchedFrom } = await fetchBars(match.symbol, 2, options);

      if (bars.length < 60) {
        return NextResponse.json(
          {
            error: `Yahoo has only ${bars.length} day${bars.length === 1 ? '' : 's'} of usable price history for ${match.symbol} — not enough for swing analysis. Try the NSE listing instead.`,
          },
          { status: 422 },
        );
      }

      // If we fell back from BSE to NSE for the price series, fetch the company
      // data from the same listing so the quote and the chart agree.
      const resolvedCompany = switchedFrom
        ? { company: await fetchCompany(symbol, options), error: undefined }
        : await companyTask;
      const company = resolvedCompany.company;
      if (!company) throw resolvedCompany.error ?? new Error(`No market data for ${symbol}`);

      const analysis = analyzeSwing(bars);

      // The swing engine is deliberately price-only, but an imminent results date
      // is a genuine gap risk it can't see from the chart. Inject it as a flag
      // here, where both the analysis and the company calendar are in hand. It
      // matters to short- and mid-term positions (held through the print), less so
      // to a multi-year hold, so it goes on those two horizons only.
      const { daysUntil, isEstimate, nextDate } = company.earnings;
      if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 10 && nextDate) {
        const when =
          daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
        const flag = `Earnings ${when} (${nextDate}${isEstimate ? ', estimated' : ''}). Holding through results is a gap risk, not a trade — size down or wait for the reaction.`;
        analysis.riskFlags.unshift(flag);
      }

      // Build all three horizons. `short` reuses the (now earnings-flagged) swing
      // analysis; mid/long are computed from the same bars and fundamentals.
      const timeframes = analyzeAllTimeframes(bars, company, analysis);
      if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 10 && nextDate) {
        const when =
          daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
        timeframes.mid.riskFlags.unshift(
          `Earnings ${when} (${nextDate}${isEstimate ? ', estimated' : ''}). A results gap can shake out a position stop — plan for it.`,
        );
      }

      // Descriptive evidence for the weeks-to-months horizon. It sits beside the
      // mid-term score and never changes it.
      const sectorChoice = chooseSectorBenchmark({
        symbol,
        sector: company.profile.sector,
        industry: company.profile.industry,
      });
      const [nifty, sectorSeries, results] = await Promise.all([
        niftyTask,
        sectorChoice.index ? benchmarkBars(sectorChoice.index.symbol, signal) : Promise.resolve<BenchmarkResult | null>(null),
        switchedFrom ? fetchReportedResults(symbol, options).catch(() => null) : resultsTask,
      ]);
      signal.throwIfAborted();
      let position: PositionEvidence | null = null;
      try {
        position = buildPositionEvidence({
          name: company.profile.name,
          bars,
          company,
          mid: timeframes.mid,
          benchmark: {
            index: BROAD_BENCHMARK,
            bars: nifty.status === 'available' ? nifty.bars : null,
            reason: nifty.status === 'unavailable' ? nifty.reason : null,
          },
          sector: {
            choice: sectorChoice,
            bars: sectorSeries?.status === 'available' ? sectorSeries.bars : null,
            reason: sectorSeries?.status === 'unavailable' ? sectorSeries.reason : null,
          },
          results,
          computedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('position evidence failed', error);
      }

      // The initial report is always ready as soon as its computed data is ready.
      // Local-model prose is optional, explicit, and never required for a report.
      const narrative = await buildNarrative(company, analysis, { allowAI: useAI, signal });
      signal.throwIfAborted();

      const payload = {
        match: switchedFrom
          ? { ...match, symbol, exchange: 'NSE' as const, switchedFrom }
          : match,
        company,
        analysis,
        timeframes,
        position,
        narrative,
        // Only the last year goes to the client — keeps the payload light and the
        // chart readable. All indicators were computed on the full 2-year series.
        bars: bars.slice(-260),
        generatedAt: new Date().toISOString(),
      };

      cache.set(key, { at: Date.now(), payload });
      // Keep a BSE-fallback notice attached only to the request that caused it.
      if (!switchedFrom) cache.set(`${symbol}:${useAI ? 'ai' : 'rules'}`, { at: Date.now(), payload });
      while (cache.size > 150) cache.delete(cache.keys().next().value!);
      return NextResponse.json(payload);
    }, 25_000, req.signal);
  } catch (err) {
    console.error('analyze failed', err);
    if (req.signal.aborted) {
      return NextResponse.json({ error: 'Stock loading was cancelled.' }, { status: 499 });
    }
    if (err instanceof ProviderTimeoutError || (err instanceof Error && err.name === 'TimeoutError')) {
      return NextResponse.json({ error: 'Yahoo is taking too long to return this stock. Please try again; your search has been kept.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Market data is temporarily unavailable for this stock. Check your connection and try again.' }, { status: 503 });
  }
}
