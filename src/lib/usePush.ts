'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Client side of Web Push: register the service worker, ask permission, and hand
 * the subscription to the server. All the browser-capability juggling lives here
 * so components can just call `enable()` / `disable()`.
 */

interface PushState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  busy: boolean;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Build over an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>,
  // which is what pushManager.subscribe's applicationServerKey requires.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function usePush() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    busy: false,
  });

  const refresh = useCallback(async () => {
    if (!isSupported()) {
      setState((s) => ({ ...s, supported: false, permission: 'unsupported' }));
      return;
    }
    try {
      const res = await fetch('/api/push');
      const data = (await res.json()) as { subscribed: boolean };
      setState((s) => ({
        ...s,
        supported: true,
        permission: Notification.permission,
        subscribed: data.subscribed,
      }));
    } catch {
      setState((s) => ({ ...s, supported: true, permission: Notification.permission }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async capability check on mount
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!isSupported()) return;
    setState((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((s) => ({ ...s, permission, busy: false }));
        return;
      }

      const keyRes = await fetch('/api/push');
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });

      setState({ supported: true, permission: 'granted', subscribed: true, busy: false });
    } catch {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState((s) => ({ ...s, subscribed: false, busy: false }));
    } catch {
      setState((s) => ({ ...s, busy: false }));
    }
  }, []);

  const test = useCallback(async () => {
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    });
  }, []);

  return { ...state, enable, disable, test };
}
