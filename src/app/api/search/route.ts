import { NextRequest, NextResponse } from 'next/server';
import { searchIndian } from '@/lib/providers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchIndian(q);
    return NextResponse.json({ results: results.slice(0, 8) });
  } catch (err) {
    console.error('search failed', err);
    return NextResponse.json({ results: [] });
  }
}
