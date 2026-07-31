import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

/** Sign out: drop the session cookie. The browser falls back to anonymous id. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
