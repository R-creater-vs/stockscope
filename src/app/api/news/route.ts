import { NextRequest, NextResponse } from 'next/server';
import { fetchCompanyNews, type NewsResult } from '@/lib/news';

export const runtime = 'nodejs';

const SYMBOL = /^[A-Za-z0-9&^._-]{1,32}$/;

/**
 * News is fetched separately from the analysis so a slow or flaky RSS feed never
 * delays the report. The report renders immediately; the news panel fills in.
 *
 * `company` is required. `symbol` is optional and only improves headline
 * matching (ticker and known aliases). The response keeps the original
 * `items` array and adds grouped, attributed fields.
 */
export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company')?.trim().slice(0, 120) ?? '';
  if (!company) return NextResponse.json({ items: [] });

  const rawSymbol = req.nextUrl.searchParams.get('symbol')?.trim() ?? '';
  const symbol = SYMBOL.test(rawSymbol) ? rawSymbol.toUpperCase() : null;
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';

  try {
    const result = await fetchCompanyNews(company, { symbol, fresh, limit: 10 });
    return NextResponse.json(result);
  } catch (err) {
    console.error('news failed', err);
    const failed: NewsResult = {
      items: [],
      recent: [],
      older: [],
      undated: [],
      status: 'error',
      error: 'Could not load news right now.',
      fetchedAt: new Date().toISOString(),
      tier: null,
      query: null,
      aliases: [],
      filteredOut: 0,
      duplicatesMerged: 0,
    };
    return NextResponse.json(failed);
  }
}
