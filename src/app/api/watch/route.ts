import { NextRequest, NextResponse } from 'next/server';
import { scanSymbols } from '@/lib/screener';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Live scores for the user's watchlist. Symbols come from the client (they live
 * in localStorage), so this route holds no state of its own.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols')?.trim() ?? '';
  const symbols = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50); // A sane cap; nobody swing-trades 50 names at once.

  if (symbols.length === 0) return NextResponse.json({ rows: [] });

  try {
    const rows = await scanSymbols(symbols.map((symbol) => ({ symbol })));
    return NextResponse.json({ rows });
  } catch (err) {
    console.error('watch failed', err);
    return NextResponse.json({ rows: [], error: 'Could not refresh watchlist.' });
  }
}
