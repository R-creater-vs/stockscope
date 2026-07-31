import { NextResponse } from 'next/server';
import { cachedStudy, runStudy, type StudyWindow } from '@/lib/backtestStudy';
import type { Engine } from '@/lib/backtest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The full study runs the engine across ~130 stocks × 3 years of daily bars.
export const maxDuration = 300;

function parseEngine(v: string | null): Engine {
  return v === 'mid' || v === 'long' ? v : 'short';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Both bounds must be present and well-formed, else we study the default window. */
function parseWindow(from: string | null, to: string | null): StudyWindow | null {
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from >= to) return null;
  return { from, to };
}

/**
 * `?engine=short|mid|long` selects which horizon's engine to validate.
 * `?cachedOnly=1` returns the cached study or 204 without triggering a run —
 * lets the UI show the result instantly when warm and a "run it" button when not.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const engine = parseEngine(params.get('engine'));
  const window = parseWindow(params.get('from'), params.get('to'));
  const cachedOnly = params.get('cachedOnly') === '1';

  if (cachedOnly) {
    const hit = cachedStudy(engine, window);
    return hit ? NextResponse.json(hit) : new NextResponse(null, { status: 204 });
  }

  try {
    const result = await runStudy(engine, window);
    return NextResponse.json(result);
  } catch (err) {
    console.error('study failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Study failed: ${message}` }, { status: 500 });
  }
}
