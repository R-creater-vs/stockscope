import { NextResponse } from 'next/server';
import { marketRegime } from '@/lib/screener';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Just the Nifty regime — for the global banner. Deliberately separate from the
 * full /api/screen scan so the banner is cheap to load on every page.
 */
export async function GET() {
  try {
    const market = await marketRegime();
    return NextResponse.json({ market });
  } catch {
    return NextResponse.json({ market: null });
  }
}
