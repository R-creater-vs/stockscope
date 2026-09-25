import { NextRequest, NextResponse } from 'next/server';
import { fetchCompany, resolveSymbol } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A lightweight quote-only endpoint for auto-refresh. Full analysis is expensive
 * and unchanged intraday for daily-bar signals; the *price* is the only thing
 * worth polling, so this returns just that. Still Yahoo-delayed — labelled as
 * such in the UI — but live-updating rather than frozen at page load.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('symbol')?.trim();
  if (!q) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    // The overview requests the configured index's provider market status.
    // Equity search intentionally excludes indices; allow this one known symbol.
    const match = q === '^NSEI' ? { symbol: '^NSEI' } : await resolveSymbol(q);
    if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const company = await fetchCompany(match.symbol);
    return NextResponse.json({
      symbol: match.symbol,
      price: company.quote.price,
      change: company.quote.change,
      changePercent: company.quote.changePercent,
      marketState: company.quote.marketState,
      at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'quote failed' }, { status: 500 });
  }
}
