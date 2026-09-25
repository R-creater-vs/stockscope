'use client';

import { useId, useState } from 'react';
import { describeAlert, useAlerts, type AlertKind } from '@/lib/useAlerts';
import NotifyToggle from './NotifyToggle';

export default function AlertControls({ symbol, name }: { symbol: string; name: string }) {
  const { add, remove, forSymbol, ready, busy, error, reload } = useAlerts();
  const mine = forSymbol(symbol);
  const [kind, setKind] = useState<AlertKind>('score_above');
  const [level, setLevel] = useState('70');
  const [move, setMove] = useState('5');
  const [timeframe, setTimeframe] = useState<'short' | 'mid'>('short');
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const id = useId();
  const isScore = kind === 'score_above' || kind === 'score_below';
  const needsThreshold = isScore || kind === 'move_pct';
  const rawThreshold = isScore ? level : move;
  const threshold = needsThreshold ? Number(rawThreshold) : null;
  const valid = !needsThreshold || (rawThreshold.trim() !== '' && Number.isFinite(threshold) && threshold !== null && threshold >= (isScore ? 0 : 0.1) && threshold <= (isScore ? 100 : 100));
  const savedTimeframe = isScore ? timeframe : 'short';
  const duplicate = mine.some((alert) => alert.kind === kind && alert.threshold === threshold && alert.timeframe === savedTimeframe);

  const condition = kind === 'score_above' ? `${timeframe === 'mid' ? 'Mid-term' : 'Swing'} technical score is at or above ${valid ? threshold : 'your threshold'}/100.`
    : kind === 'score_below' ? `${timeframe === 'mid' ? 'Mid-term' : 'Swing'} technical score is at or below ${valid ? threshold : 'your threshold'}/100.`
      : kind === 'breakout' ? 'Latest daily close is above the highest high of the preceding 20 sessions.'
        : kind === 'hits_stop' ? 'Latest daily close is below the swing stop recalculated at the time of the check. This is not a fixed entry stop.'
          : `Daily close changes by at least ${valid ? threshold : 'your threshold'}% in either direction versus the previous close.`;

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || duplicate) return;
    setMessage(null);
    const result = await add({ symbol, name, kind, threshold, timeframe: savedTimeframe });
    setMessage({ text: result ?? `Rule saved for ${name}. ${condition}`, failed: result !== null });
  };

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <p className="text-sm leading-relaxed text-[var(--muted)]">Set a condition to revisit this report. Rules use delayed daily bars and run when the server checks them.</p>
      {kind === 'hits_stop' && <p className="border-l-2 border-[var(--warn)] pl-4 text-sm leading-relaxed text-[var(--warn)]">Evaluator limitation: this stop is recalculated below the latest close, so this condition may never trigger. It does not monitor a saved entry stop or protect a position.</p>}
      <form onSubmit={create} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-kind`} className="space-y-2 text-sm"><span className="block text-[var(--muted)]">Watch for</span><select id={`${id}-kind`} value={kind} onChange={(event) => { setKind(event.target.value as AlertKind); setMessage(null); }} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"><option value="score_above">Score at or above</option><option value="score_below">Score at or below</option><option value="breakout">20-day high breakout</option><option value="hits_stop">Below recalculated swing stop</option><option value="move_pct">Daily move, either direction</option></select></label>
          {needsThreshold && <label htmlFor={`${id}-threshold`} className="space-y-2 text-sm"><span className="block text-[var(--muted)]">{isScore ? 'Score threshold · 0–100' : 'Daily move · %'}</span><input id={`${id}-threshold`} type="number" inputMode="decimal" min={isScore ? 0 : 0.1} max={100} step={isScore ? 1 : 0.1} value={rawThreshold} required aria-invalid={!valid} onChange={(event) => { (isScore ? setLevel : setMove)(event.target.value); setMessage(null); }} className="tnum min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3" /></label>}
          {isScore && <label htmlFor={`${id}-timeframe`} className="space-y-2 text-sm"><span className="block text-[var(--muted)]">Score timeframe</span><select id={`${id}-timeframe`} value={timeframe} onChange={(event) => setTimeframe(event.target.value as 'short' | 'mid')} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"><option value="short">Swing</option><option value="mid">Mid-term</option></select></label>}
        </div>
        <div className="rounded-lg bg-[var(--background)] p-4"><p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">This rule will trigger when</p><p className="mt-2 text-sm leading-relaxed">{condition}</p><p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">The condition may already be true. A new crossing is not required. The same rule can notify again after 6 hours.</p></div>
        <button type="submit" disabled={!ready || busy || !valid || duplicate} className="min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--background)] disabled:opacity-50">{busy ? 'Saving…' : duplicate ? 'Rule already saved' : 'Save alert rule'}</button>
        {message && <p role={message.failed ? 'alert' : 'status'} className="text-sm leading-relaxed" style={{ color: message.failed ? 'var(--bear)' : 'var(--bull)' }}>{message.text}</p>}
        {error && !message?.failed && <div role="alert" className="text-sm text-[var(--bear)]">{error} <button type="button" disabled={busy} onClick={() => void reload()} className="min-h-11 px-3 underline">Retry rules</button></div>}
      </form>
      <div className="border-t border-[var(--border)] pt-4"><p className="mb-3 text-sm font-medium">Browser delivery</p><NotifyToggle compact /></div>
      {mine.length > 0 && <div className="border-t border-[var(--border)] pt-4"><h3 className="text-sm font-medium">Saved for this stock</h3><ul className="mt-2 divide-y divide-[var(--border)]">{mine.map((alert) => <li key={alert.id} className="flex items-center justify-between gap-3 py-2"><div><p className="text-sm text-[var(--muted)]">{describeAlert(alert)}</p>{alert.last_fired && <p className="mt-1 text-xs text-[var(--muted)]">Last recorded {new Date(alert.last_fired).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>}</div><button type="button" disabled={busy} onClick={async () => { const result = await remove(alert.id); setMessage({ text: result ?? 'Rule removed.', failed: result !== null }); }} aria-label={`Remove alert: ${describeAlert(alert)}`} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-[var(--muted)] hover:text-[var(--bear)] disabled:opacity-50">Remove</button></li>)}</ul></div>}
    </div>
  );
}
