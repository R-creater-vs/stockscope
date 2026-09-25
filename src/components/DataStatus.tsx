'use client';
import { useEffect, useState } from 'react';

export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return offline ? <div role="status" className="notice">You’re offline. Previously loaded research may be out of date. Reconnect to refresh or save changes.</div> : null;
}

export default function DataStatus({ at, label = 'Scan computed' }: { at?: string; label?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);
  const stale = Boolean(at && now && now - new Date(at).getTime() > 20 * 60_000);
  return <div className="data-status">
    <span className={stale ? 'text-[var(--warn)]' : ''}>{stale ? 'Older scan · ' : ''}{at ? `${label} ${new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST` : 'Waiting for scan'}</span>
    <span>Yahoo Finance · delayed data · source quote time not supplied</span>
  </div>;
}
