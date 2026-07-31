import { NextRequest, NextResponse } from 'next/server';
import { googleConfigured, googleAuthUrl, newState, OAUTH_STATE_COOKIE } from '@/lib/auth';

/**
 * Kick off Google sign-in: mint a CSRF `state`, stash it in a short-lived cookie,
 * and bounce the browser to Google's consent screen. If the operator hasn't set
 * up an OAuth client yet, send them back to a page that explains how.
 */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/?auth=setup', origin));
  }

  const state = newState();
  const res = NextResponse.redirect(googleAuthUrl(origin, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes to complete the round-trip
    path: '/',
    secure: origin.startsWith('https'),
  });
  return res;
}
