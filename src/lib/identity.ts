import { headers } from 'next/headers';
import { ensureUser } from './db';
import { getSession } from './auth';

/**
 * The current user id for the request. Two tiers, checked in order:
 *
 *  1. A signed-in Google account — the `uid` from a valid session cookie
 *     (e.g. "google:1234567890"). This wins so a user's data follows them
 *     across devices once they sign in.
 *  2. The anonymous per-device id set by middleware (the `x-user-id` header),
 *     which every browser gets for free before it signs in.
 *
 * Either way the `users` row is ensured so foreign keys hold.
 */
export async function currentUserId(): Promise<string> {
  const session = await getSession();
  if (session) {
    ensureUser(session.uid);
    return session.uid;
  }

  const h = await headers();
  const id = h.get('x-user-id') ?? 'anonymous';
  ensureUser(id);
  return id;
}
