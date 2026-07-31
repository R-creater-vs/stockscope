import { NextResponse } from 'next/server';
import { buildSectorRotation, screen } from '@/lib/screener';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A full scan of ~130 symbols takes longer than the default serverless budget.
export const maxDuration = 120;

export async function GET() {
  try {
    const result = await screen();
    return NextResponse.json({
      market: result.market,
      // Buckets are built in the browser from `all`, so price filtering can
      // re-bucket instantly without a round-trip. Only sectors and the raw rows
      // travel over the wire.
      sectors: buildSectorRotation(result.rows),
      all: result.rows,
      scanned: result.scanned,
      failed: result.failed,
      generatedAt: result.generatedAt,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('screen failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
