/**
 * Authentication core — real Google sign-in, no third-party auth service.
 *
 * The whole app's ethos is "no accounts to sign up for": VAPID keys and the
 * database are self-generated and local. Sessions follow the same rule. We do
 * NOT pull in NextAuth or an external session store; instead a session is a
 * compact JSON payload signed with HMAC-SHA256 using a secret that, like the
 * VAPID pair, is generated on first run and persisted to `.data/auth.json`
 * (override with AUTH_SECRET in production).
 *
 * Google sign-in itself is the one thing that genuinely requires the operator to
 * register an OAuth client (there is no way around that — Google mints the
 * credentials). Until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set the app
 * runs exactly as before on anonymous per-device identity; the sign-in button
 * then explains how to enable it.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'ss_session';
export const OAUTH_STATE_COOKIE = 'ss_oauth_state';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const SECRET_PATH = process.env.STOCKSCOPE_AUTH_PATH ?? join(/* turbopackIgnore: true */ process.cwd(), '.data', 'auth.json');

/* --------------------------------------------------------------- secret */

let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.AUTH_SECRET) {
    cachedSecret = process.env.AUTH_SECRET;
  } else if (existsSync(/* turbopackIgnore: true */ SECRET_PATH)) {
    // Provisioned at runtime; local signing secrets must not enter build traces.
    cachedSecret = (JSON.parse(readFileSync(/* turbopackIgnore: true */ SECRET_PATH, 'utf8')) as { secret: string }).secret;
  } else {
    cachedSecret = randomBytes(32).toString('hex');
    mkdirSync(dirname(SECRET_PATH), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ SECRET_PATH, JSON.stringify({ secret: cachedSecret }, null, 2));
  }
  return cachedSecret;
}

/* ------------------------------------------------------- token signing */

export interface SessionPayload {
  uid: string; // e.g. "google:1234567890"
  email: string;
  name: string;
  picture: string;
  iat: number; // issued-at, seconds
  exp: number; // expiry, seconds
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64url');

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

/** Produce a signed, tamper-evident session token. */
export function signSession(
  user: Pick<SessionPayload, 'uid' | 'email' | 'name' | 'picture'>,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...user, iat: now, exp: now + SESSION_MAX_AGE };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Verify a token and return its payload, or null if invalid/expired/forged. */
export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body);
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The current signed-in session (from the cookie), or null when anonymous. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/* --------------------------------------------------------- google oauth */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The redirect URI Google calls back. Derived from the request unless pinned. */
export function callbackUrl(origin: string): string {
  const base = process.env.AUTH_URL?.replace(/\/$/, '') ?? origin;
  return `${base}/api/auth/callback/google`;
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}

/** Build the Google consent-screen URL to redirect the user to. */
export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

/**
 * Exchange the one-time code for tokens and read the user's profile out of the
 * id_token. The id_token comes straight from Google's token endpoint over TLS,
 * so decoding its payload is sufficient here (no separate signature fetch); we
 * still sanity-check the audience and expiry.
 */
export async function exchangeCode(code: string, origin: string): Promise<GoogleProfile | null> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return null;

  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) return null;

  const parts = tokens.id_token.split('.');
  if (parts.length !== 3) return null;

  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      aud: string;
      exp: number;
      email_verified?: boolean;
    };
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? claims.email.split('@')[0],
      picture: claims.picture ?? '',
    };
  } catch {
    return null;
  }
}
