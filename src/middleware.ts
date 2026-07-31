import { NextRequest, NextResponse } from 'next/server';

/**
 * Assigns every browser a stable anonymous id. This is deliberately NOT a login
 * — there is no password and nothing personal — but it is real server-side
 * identity: it lets watchlists, alert rules and push subscriptions persist in
 * the database and be found again by the background scheduler.
 *
 * The id is both set as a long-lived cookie (for future requests) and forwarded
 * as a request header (so THIS request's handler sees it immediately, before the
 * cookie round-trips).
 */
export function middleware(req: NextRequest) {
  let id = req.cookies.get('sid')?.value;
  const isNew = !id;
  if (!id) id = crypto.randomUUID();

  const headers = new Headers(req.headers);
  headers.set('x-user-id', id);

  const res = NextResponse.next({ request: { headers } });
  if (isNew) {
    res.cookies.set('sid', id, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // one year
      path: '/',
    });
  }
  return res;
}

export const config = {
  // Everything except static assets and the service worker/manifest.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)'],
};
