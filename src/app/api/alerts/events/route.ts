import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/identity';
import { recentEvents } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json({ events: recentEvents(userId, 30) });
}
