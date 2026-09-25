import { NextRequest, NextResponse } from 'next/server';
import { searchIndian } from '@/lib/providers';
import { ProviderTimeoutError, withDeadline } from '@/lib/providerRequest';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await withDeadline((signal) => searchIndian(q, { signal, priority: 'interactive' }), 6_000, req.signal);
    return NextResponse.json({ results: results.slice(0, 8) });
  } catch (err) {
    console.error('search failed', err);
    const timedOut = err instanceof ProviderTimeoutError;
    return NextResponse.json({ results: [], error: timedOut
      ? 'Stock search is taking too long. Try the exact ticker or search again.'
      : 'Stock search is temporarily unavailable. Please try again.' }, { status: timedOut ? 504 : 503 });
  }
}
