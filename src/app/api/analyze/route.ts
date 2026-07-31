import { NextRequest, NextResponse } from 'next/server';
import { analyzeSwing } from '@/lib/swing';
import { analyzeAllTimeframes } from '@/lib/multiTimeframe';
import { buildNarrative } from '@/lib/narrative';
import { fetchBars, fetchCompany, resolveSymbol } from '@/lib/providers';

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

  const key = query.toUpperCase();
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload);
  }

  try {
    const match = await resolveSymbol(query);
    if (!match) {
      return NextResponse.json(
        { error: `Could not find an NSE or BSE listing for "${query}". Try the exact ticker, e.g. TCS or INFY.` },
        { status: 404 },
      );
    }

    const { bars, symbol, switchedFrom } = await fetchBars(match.symbol, 2);

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
    const company = await fetchCompany(symbol);

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

    const narrative = await buildNarrative(company, analysis);

    const payload = {
      match: switchedFrom
        ? { ...match, symbol, exchange: 'NSE' as const, switchedFrom }
        : match,
      company,
      analysis,
      timeframes,
      narrative,
      // Only the last year goes to the client — keeps the payload light and the
      // chart readable. All indicators were computed on the full 2-year series.
      bars: bars.slice(-260),
      generatedAt: new Date().toISOString(),
    };

    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('analyze failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  }
}
