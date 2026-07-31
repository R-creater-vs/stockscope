import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/identity';
import { addWatch, getWatchlist, removeWatch } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json({ items: getWatchlist(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; name?: string };
  const symbol = body.symbol?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  addWatch(userId, symbol, body.name?.trim() || symbol);
  return NextResponse.json({ items: getWatchlist(userId) });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  removeWatch(userId, symbol);
  return NextResponse.json({ items: getWatchlist(userId) });
}
