'use client';

import { useCallback, useEffect, useState } from 'react';

interface PushState {
  ready: boolean;
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  busy: boolean;
  error: string | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function pushRequest(body?: object) {
  const res = await fetch('/api/push', body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : { cache: 'no-store' });
  const data = (await res.json()) as { publicKey?: string; subscribed?: boolean; delivered?: number; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || 'Notification service is unavailable. Please retry.');
  return data;
}

export function usePush() {
  const [state, setState] = useState<PushState>({ ready: false, supported: false, permission: 'unsupported', subscribed: false, busy: false, error: null });

  const refresh = useCallback(async () => {
    if (!isSupported()) {
      setState((old) => ({ ...old, ready: true, supported: false, permission: 'unsupported' }));
      return;
    }
    try {
      const data = await pushRequest();
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setState((old) => ({ ...old, ready: true, supported: true, permission: Notification.permission, subscribed: Boolean(subscription && data.subscribed), error: null }));
    } catch {
      setState((old) => ({ ...old, ready: true, supported: true, permission: Notification.permission, error: 'Notification status could not be verified. Check your connection and retry.' }));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const enable = useCallback(async (): Promise<string | null> => {
    if (!isSupported()) return 'This browser does not support push notifications.';
    setState((old) => ({ ...old, busy: true, error: null }));
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        const error = permission === 'denied' ? 'Notifications are blocked in browser settings.' : 'Permission was not granted. Your rules remain saved.';
        setState((old) => ({ ...old, permission, busy: false, error }));
        return error;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { publicKey } = await pushRequest();
      if (!publicKey) throw new Error('Push notifications are not configured on this server.');
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await pushRequest({ action: 'subscribe', subscription: subscription.toJSON() });
      setState({ ready: true, supported: true, permission: 'granted', subscribed: true, busy: false, error: null });
      return null;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Notifications could not be enabled. Please retry.';
      setState((old) => ({ ...old, busy: false, error }));
      return error;
    }
  }, []);

  const disable = useCallback(async (): Promise<string | null> => {
    setState((old) => ({ ...old, busy: true, error: null }));
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await pushRequest({ action: 'unsubscribe', endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState((old) => ({ ...old, subscribed: false, busy: false }));
      return null;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'The notification change could not be confirmed.';
      setState((old) => ({ ...old, busy: false, error }));
      return error;
    }
  }, []);

  const test = useCallback(async (): Promise<{ delivered: number; error: string | null }> => {
    setState((old) => ({ ...old, busy: true, error: null }));
    try {
      const data = await pushRequest({ action: 'test' });
      setState((old) => ({ ...old, busy: false }));
      return { delivered: data.delivered ?? 0, error: null };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'A test notification could not be sent.';
      setState((old) => ({ ...old, busy: false, error }));
      return { delivered: 0, error };
    }
  }, []);

  return { ...state, enable, disable, test, refresh };
}
