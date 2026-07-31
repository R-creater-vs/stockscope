import { NextRequest, NextResponse } from 'next/server';
import { resolveSymbol } from '@/lib/providers';
import { fetchIntraday } from '@/lib/yahoo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The latest session's intraday price line — real data, Yahoo-delayed (~15 min).
 * Drives the "price today" chart. Delayed is fine here by design: this app is for
 * weeks-to-weeks swing trading, not intraday, so no broker feed is needed.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('symbol')?.trim();
  if (!q) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const match = await resolveSymbol(q);
    if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const data = await fetchIntraday(match.symbol);
    return NextResponse.json({ ...data, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'intraday failed' }, { status: 500 });
  }
}
