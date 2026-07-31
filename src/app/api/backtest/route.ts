import { NextRequest, NextResponse } from 'next/server';
import { backtestSymbol, DEFAULT_CONFIG } from '@/lib/backtest';
import { fetchBars, resolveSymbol } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Backtests re-run the engine at every historical day, so they are cached hard. */
const cache = new Map<string, { at: number; payload: unknown }>();
const TTL_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query) return NextResponse.json({ error: 'Enter a stock.' }, { status: 400 });

  const key = query.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.payload);

  try {
    const match = await resolveSymbol(query);
    if (!match) {
      return NextResponse.json({ error: `Could not find "${query}".` }, { status: 404 });
    }

    // Three years gives enough decision days for the numbers to mean something.
    const { bars, symbol } = await fetchBars(match.symbol, 3);
    if (bars.length < DEFAULT_CONFIG.warmup + 30) {
      return NextResponse.json(
        {
          error: `Only ${bars.length} days of history for ${symbol} — too few to backtest (need ~${DEFAULT_CONFIG.warmup + 30}).`,
        },
        { status: 422 },
      );
    }

    const result = backtestSymbol(symbol, bars);
    const payload = { match: { ...match, symbol }, result, generatedAt: new Date().toISOString() };
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('backtest failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Backtest failed: ${message}` }, { status: 500 });
  }
}
