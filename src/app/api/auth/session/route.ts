import { NextResponse } from 'next/server';
import { getSession, googleConfigured } from '@/lib/auth';

/**
 * Who is signed in (if anyone), plus whether Google sign-in is even available on
 * this deployment — the client uses the latter to decide whether to offer the
 * button or show setup instructions.
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    user: session
      ? {
          uid: session.uid,
          email: session.email,
          name: session.name,
          picture: session.picture,
        }
      : null,
    googleConfigured: googleConfigured(),
  });
}
