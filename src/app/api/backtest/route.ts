import { NextRequest, NextResponse } from 'next/server';
import { resolveSymbol } from '@/lib/providers';
import { getOrStartBacktest } from '@/lib/backtestJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Since the backtest itself now runs as a background job (see backtestJobs.ts
 * — replaying a stock's entire history can take a minute or more), this route
 * never blocks on the computation. It resolves the symbol, asks the job
 * manager for a status, and returns immediately either way: the cached result,
 * or "pending" for the client to poll.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query) return NextResponse.json({ error: 'Enter a stock.' }, { status: 400 });

  try {
    const match = await resolveSymbol(query);
    if (!match) {
      return NextResponse.json({ error: `Could not find "${query}".` }, { status: 404 });
    }

    const status = getOrStartBacktest(match.symbol, match);
    if (status.status === 'ready') {
      return NextResponse.json({ status: 'ready', ...status.payload });
    }
    if (status.status === 'error') {
      return NextResponse.json({ status: 'error', error: status.error }, { status: 500 });
    }
    return NextResponse.json({ status: 'pending', startedAt: status.startedAt });
  } catch (err) {
    console.error('backtest failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Backtest failed: ${message}` }, { status: 500 });
  }
}
