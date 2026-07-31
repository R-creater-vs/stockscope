import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCode,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  OAUTH_STATE_COOKIE,
} from '@/lib/auth';
import { migrateUserData, upsertUser } from '@/lib/db';

/**
 * Google redirects back here with a one-time code. We verify the CSRF state,
 * exchange the code for the user's profile, upsert the account, carry over any
 * anonymous data from this device, then set the signed session cookie.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?auth=${reason}`, origin));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  // State must match the cookie we set at the start of the flow.
  if (!code || !state || !savedState || state !== savedState) return fail('error');

  const profile = await exchangeCode(code, origin);
  if (!profile) return fail('error');

  const uid = `google:${profile.sub}`;
  upsertUser({
    id: uid,
    provider: 'google',
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  });

  // Bring the watchlist/alerts this browser built while anonymous onto the account.
  const anonId = req.cookies.get('sid')?.value;
  if (anonId) {
    try {
      migrateUserData(anonId, uid);
    } catch {
      /* non-fatal: sign-in still succeeds even if the carry-over fails */
    }
  }

  const token = signSession({
    uid,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  });

  const res = NextResponse.redirect(new URL('/?auth=success', origin));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
    secure: origin.startsWith('https'),
  });
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
