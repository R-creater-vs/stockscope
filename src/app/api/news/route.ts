import { NextRequest, NextResponse } from 'next/server';
import { fetchNews } from '@/lib/news';

export const runtime = 'nodejs';

/**
 * News is fetched separately from the analysis so a slow or flaky RSS feed never
 * delays the report. The report renders immediately; the news panel fills in.
 */
export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company')?.trim() ?? '';
  if (!company) return NextResponse.json({ items: [] });

  const fresh = req.nextUrl.searchParams.get('fresh') === '1';

  try {
    const items = await fetchNews(company, 8, { fresh });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('news failed', err);
    return NextResponse.json({ items: [], error: 'Could not load news right now.' });
  }
}
