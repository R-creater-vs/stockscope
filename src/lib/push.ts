/**
 * Web Push. Notifications reach the browser even with the tab closed, delivered
 * through the browser vendor's own push service — which needs no account, only a
 * VAPID key pair that we generate ourselves on first run and persist locally.
 *
 * So: real push notifications, zero external services, zero keys to sign up for.
 */

import webpush from 'web-push';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getPushSubs, removePushSub, type PushSub } from './db';

const VAPID_PATH = process.env.STOCKSCOPE_VAPID_PATH ?? join(/* turbopackIgnore: true */ process.cwd(), '.data', 'vapid.json');
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:alerts@stockscope.local';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: VapidKeys | null = null;

/** Load the VAPID pair, generating and persisting it the first time. */
function vapid(): VapidKeys {
  if (keys) return keys;

  // Explicit env keys win, so production can pin a stable pair across restarts.
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (existsSync(/* turbopackIgnore: true */ VAPID_PATH)) {
    // This file is provisioned at runtime, never a build dependency. Excluding
    // the argument from tracing also covers the background instrumentation job.
    keys = JSON.parse(readFileSync(/* turbopackIgnore: true */ VAPID_PATH, 'utf8')) as VapidKeys;
  } else {
    keys = webpush.generateVAPIDKeys();
    mkdirSync(dirname(VAPID_PATH), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ VAPID_PATH, JSON.stringify(keys, null, 2));
  }

  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
  return keys;
}

export function publicKey(): string {
  return vapid().publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  symbol?: string;
  url?: string;
}

/**
 * Send to every subscription a user has registered. A 404/410 means the browser
 * dropped the subscription, so we prune it — otherwise dead endpoints pile up.
 * Returns how many devices were reached.
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  vapid();
  const subs = getPushSubs(userId);
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(toWebPushSub(s), JSON.stringify(payload));
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) removePushSub(s.endpoint);
      }
    }),
  );

  return delivered;
}

function toWebPushSub(s: PushSub) {
  return { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
}
