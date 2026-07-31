import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/identity';
import { addAlert, getAlerts, removeAlert, type AlertKind } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: AlertKind[] = ['score_above', 'score_below', 'breakout', 'hits_stop', 'move_pct'];

export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json({ alerts: getAlerts(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  const b = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    name?: string;
    kind?: string;
    threshold?: number | null;
    timeframe?: string;
  };

  const symbol = b.symbol?.trim().toUpperCase();
  const kind = b.kind as AlertKind | undefined;
  if (!symbol || !kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: 'symbol and valid kind required' }, { status: 400 });
  }
  // Threshold-based rules must carry a number.
  if ((kind === 'score_above' || kind === 'score_below' || kind === 'move_pct') && typeof b.threshold !== 'number') {
    return NextResponse.json({ error: 'threshold required for this alert kind' }, { status: 400 });
  }

  addAlert({
    id: crypto.randomUUID(),
    user_id: userId,
    symbol,
    name: b.name?.trim() || symbol,
    kind,
    threshold: typeof b.threshold === 'number' ? b.threshold : null,
    timeframe: b.timeframe === 'mid' ? 'mid' : 'short',
  });

  return NextResponse.json({ alerts: getAlerts(userId) });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  removeAlert(userId, id);
  return NextResponse.json({ alerts: getAlerts(userId) });
}
