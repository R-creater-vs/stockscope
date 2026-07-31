'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Client mirror of the auth session. Same module-store shape as useWatchlist: a
 * single fetch of /api/auth/session shared across every component that needs to
 * know who is signed in, kept in sync via useSyncExternalStore.
 *
 * Signing IN is a full-page navigation to /api/auth/google (OAuth redirect), so
 * there's no client action for it — just a link. Signing OUT posts and reloads,
 * which re-initialises every other store for the anonymous identity.
 */

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  picture: string;
}

interface AuthState {
  user: AuthUser | null;
  googleConfigured: boolean;
  ready: boolean;
}

let state: AuthState = { user: null, googleConfigured: false, ready: false };
let loadStarted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function load() {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const res = await fetch('/api/auth/session');
    const data = (await res.json()) as { user: AuthUser | null; googleConfigured: boolean };
    state = { user: data.user, googleConfigured: data.googleConfigured, ready: true };
  } catch {
    state = { ...state, ready: true };
  }
  emit();
}

export async function signOut() {
  try {
    await fetch('/api/auth/signout', { method: 'POST' });
  } finally {
    // Hard reload so watchlist/alerts stores re-load under the anonymous id.
    window.location.href = '/';
  }
}

export const SIGN_IN_HREF = '/api/auth/google';

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getSnapshot = () => state;
const SERVER_STATE: AuthState = { user: null, googleConfigured: false, ready: false };
const getServerSnapshot = () => SERVER_STATE;

export function useAuth() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    load();
  }, []);
  return snap;
}
