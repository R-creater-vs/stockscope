import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/identity';
import { removePushSub, savePushSub, userHasPush } from '@/lib/db';
import { publicKey, sendToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → the VAPID public key the browser needs to subscribe, plus current status. */
export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json({ publicKey: publicKey(), subscribed: userHasPush(userId) });
}

/**
 * POST body:
 *   { action: 'subscribe', subscription }  — store a PushSubscription
 *   { action: 'unsubscribe', endpoint }    — drop one
 *   { action: 'test' }                     — send a test notification
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    subscription?: { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    endpoint?: string;
  };

  if (body.action === 'subscribe' && body.subscription?.endpoint) {
    const { endpoint, keys } = body.subscription;
    if (!keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'subscription missing keys' }, { status: 400 });
    }
    savePushSub(userId, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return NextResponse.json({ ok: true, subscribed: true });
  }

  if (body.action === 'unsubscribe' && body.endpoint) {
    removePushSub(body.endpoint);
    return NextResponse.json({ ok: true, subscribed: userHasPush(userId) });
  }

  if (body.action === 'test') {
    const delivered = await sendToUser(userId, {
      title: 'NIVRA alerts are on',
      body: 'This is a test notification. Price alerts will arrive here even with the tab closed.',
      url: '/',
    });
    return NextResponse.json({ ok: true, delivered });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
