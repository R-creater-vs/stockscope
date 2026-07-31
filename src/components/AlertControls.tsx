'use client';

import { useState } from 'react';
import { useAlerts, type AlertKind } from '@/lib/useAlerts';
import NotifyToggle from './NotifyToggle';

/**
 * Per-stock alert setup, shown inside a report. Presets cover the setups a swing
 * trader actually watches for; the two threshold kinds take a number.
 */
export default function AlertControls({ symbol, name }: { symbol: string; name: string }) {
  const { add, remove, forSymbol } = useAlerts();
  const mine = forSymbol(symbol.toUpperCase());
  const [scoreLevel, setScoreLevel] = useState(70);
  const [movePct, setMovePct] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);

  const create = async (kind: AlertKind, threshold?: number) => {
    const err = await add({ symbol, name, kind, threshold, timeframe: 'short' });
    setMsg(err ?? 'Alert added.');
    setTimeout(() => setMsg(null), 2500);
  };

  const KIND_TEXT: Record<AlertKind, string> = {
    breakout: '20-day breakout',
    hits_stop: 'Breaks swing stop',
    score_above: `Score ≥ ${scoreLevel}`,
    score_below: `Score ≤ ${scoreLevel}`,
    move_pct: `Moves ≥ ${movePct}%`,
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Get notified when this stock does something — even with the tab closed.
        </p>
        <NotifyToggle compact />
      </div>

      <div className="flex flex-wrap gap-2">
        <Preset onClick={() => create('breakout')}>+ Breakout</Preset>
        <Preset onClick={() => create('hits_stop')}>+ Breaks stop</Preset>

        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs">
          Score ≥
          <input
            type="number"
            min={0}
            max={100}
            value={scoreLevel}
            onChange={(e) => setScoreLevel(Number(e.target.value))}
            className="tnum w-12 bg-transparent text-center outline-none"
          />
          <button onClick={() => create('score_above', scoreLevel)} className="text-[var(--accent)]">
            add
          </button>
        </span>

        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs">
          Moves ≥
          <input
            type="number"
            min={1}
            max={50}
            value={movePct}
            onChange={(e) => setMovePct(Number(e.target.value))}
            className="tnum w-10 bg-transparent text-center outline-none"
          />
          %
          <button onClick={() => create('move_pct', movePct)} className="text-[var(--accent)]">
            add
          </button>
        </span>
      </div>

      {msg && <p className="text-xs text-[var(--bull)]">{msg}</p>}

      {mine.length > 0 && (
        <ul className="space-y-1.5 border-t border-[var(--border)] pt-3">
          {mine.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">
                {KIND_TEXT[a.kind]}
                {a.last_fired && (
                  <span className="ml-2 text-[10px] text-[var(--warn)]">
                    fired {new Date(a.last_fired).toLocaleDateString('en-IN')}
                  </span>
                )}
              </span>
              <button
                onClick={() => remove(a.id)}
                className="text-[var(--muted)] transition hover:text-[var(--bear)]"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Preset({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}
