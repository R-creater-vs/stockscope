import { NextResponse } from 'next/server';
import { scanAlerts } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Manual trigger for the same sweep the scheduler runs. Useful for testing and
 * for a "check now" button — the outcome is identical to the timed run.
 */
export async function POST() {
  try {
    const summary = await scanAlerts();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
