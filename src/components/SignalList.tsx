'use client';

import type { Signal } from '@/lib/swing';
import type { Timeframe } from '@/lib/timeframes';
import { MID_INPUTS, MID_SCORE_NOTE } from '@/lib/midRules';

const DIR_COLOR = { bullish: 'var(--bull)', bearish: 'var(--bear)', neutral: 'var(--muted)' } as const;
const CATEGORY_NOTE: Record<string, string> = {
  Trend: 'Price direction & trend strength',
  Momentum: 'The pace of price movement',
  Volume: 'Participation in the move',
  Volatility: 'Range expansion & compression',
  Structure: 'Position within the recent range',
};
const SIGNAL_NAME: Record<string, string> = {
  'Price vs moving averages': 'Price vs 20 / 50 EMA',
  'Trend strength (ADX)': 'Trend strength · ADX & DI',
  'Volume confirmation': 'Volume vs 20-day average',
  'Bollinger position': 'Bollinger position / squeeze',
  '20-day range position': '20-day range / breakout',
};
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
const SWING_INPUTS = [
  { name: 'Price vs moving averages', category: 'Trend', weight: 18 },
  { name: '20/50 EMA alignment', category: 'Trend', weight: 12 },
  { name: 'Trend strength (ADX)', category: 'Trend', weight: 12 },
  { name: 'RSI (14)', category: 'Momentum', weight: 14 },
  { name: 'MACD histogram', category: 'Momentum', weight: 14 },
  { name: 'Volume confirmation', category: 'Volume', weight: 12 },
  { name: 'Bollinger position', category: 'Volatility', weight: 8 },
  { name: '20-day range position', category: 'Structure', weight: 10 },
] as const;

/** Common shape of the swing and mid input lists; only mid inputs carry a lookback. */
type InputDef = { name: string; category: string; weight: number; lookback?: string };

export default function SignalList({ signals, score, timeframe }: { signals: Signal[]; score: number; timeframe?: Timeframe }) {
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const contribution = (signal: Signal) => totalWeight ? 50 * signal.weight * signal.score / totalWeight : 0;
  const net = signals.reduce((sum, signal) => sum + contribution(signal), 0);
  const isSwing = timeframe ? timeframe === 'short' : signals.some((signal) => signal.name === '20-day range position');
  const isMid = timeframe === 'mid';
  const inputs: readonly InputDef[] = isSwing ? SWING_INPUTS : isMid ? MID_INPUTS : [];
  const missing = inputs.filter((input) => !signals.some((signal) => signal.name === input.name));
  const categories = [...new Set(inputs.length ? inputs.map((input) => input.category) : signals.map((signal) => signal.category))];
  const midRule = (name: string) => (isMid ? MID_INPUTS.find((input) => input.name === name) : undefined);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" aria-label="Weighted signal evidence">
      <header className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">What formed the score</h2>
          <p className="tnum text-sm"><span className="text-[var(--muted)]">Engine score </span><strong>{score.toFixed(1)} / 100</strong></p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Start at 50. Each rule adds or subtracts points based on its direction and weight.
          {isSwing
            ? ` ${signals.length} of 8 checks available, grouped into five kinds of evidence.`
            : isMid
              ? ` ${signals.length} of ${MID_INPUTS.length} position checks available, grouped into three kinds of evidence. Each check shows its exact rule.`
              : ' The selected timeframe uses its own rules.'}
        </p>
        <p className="tnum mt-2 text-xs text-[var(--muted)]">Combined contribution: approximately {signed(net)} points. The headline uses the engine&apos;s exact rounded score.</p>
      </header>

      {signals.length === 0 ? <p className="px-5 py-6 text-sm text-[var(--muted)]">No signal inputs are available. The neutral baseline is 50; it is not an assessment of this stock.</p> : (
        <div className="divide-y divide-[var(--border)]">
          {categories.map((category) => {
            const group = signals.filter((signal) => signal.category === category);
            const groupPoints = group.reduce((sum, signal) => sum + contribution(signal), 0);
            return <div key={category} className="px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div><h3 className="text-sm font-semibold">{category}</h3><p className="mt-0.5 text-xs text-[var(--muted)]">{CATEGORY_NOTE[category] ?? 'Evidence for this timeframe'}</p></div>
                <p className="tnum shrink-0 text-sm font-medium" style={{ color: groupPoints > 0 ? 'var(--bull)' : groupPoints < 0 ? 'var(--bear)' : 'var(--muted)' }}>{signed(groupPoints)} pts</p>
              </div>
              <ul className="space-y-1">
                {group.map((signal) => <li key={signal.name}>
                  <details className="group rounded-lg open:bg-[var(--surface-2)]">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2 group-open:px-3">
                      <div className="min-w-0">
                        <p className="text-sm">{SIGNAL_NAME[signal.name] ?? signal.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">Weight {signal.weight}<span className="mx-1.5">·</span><span style={{ color: DIR_COLOR[signal.direction] }}>{signal.direction}</span><span className="ml-1.5" aria-hidden="true">⌄</span></p>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="tnum text-sm font-medium">{signed(contribution(signal))}<span className="ml-1 text-xs font-normal text-[var(--muted)]">pts</span></p>
                        <ScoreBar score={signal.score} />
                      </div>
                    </summary>
                    <p className="px-3 pb-3 text-sm leading-relaxed text-[var(--muted)]">{signal.detail}</p>
                    {midRule(signal.name) && <p className="px-3 pb-3 text-xs leading-relaxed text-[var(--muted)]"><span className="font-medium text-[var(--foreground)]">Rule: </span>{midRule(signal.name)!.rule} Lookback: {midRule(signal.name)!.lookback}. Input {signal.score >= 0 ? '+' : '−'}{Math.abs(signal.score).toFixed(2)} on the −1 to +1 scale.</p>}
                  </details>
                </li>)}
                {missing.filter((input) => input.category === category).map((input) => <li key={input.name} className="flex min-h-14 items-center justify-between gap-3 py-2 text-sm text-[var(--muted)]"><div>{SIGNAL_NAME[input.name] ?? input.name}<p className="mt-1 text-xs">Weight {input.weight} · input unavailable{input.lookback ? ` (needs ${input.lookback.toLowerCase()})` : ''}</p></div><span className="text-xs">Excluded</span></li>)}
              </ul>
            </div>;
          })}
        </div>
      )}
      <details className="border-t border-[var(--border)] px-5">
        <summary className="min-h-12 cursor-pointer py-3 text-sm text-[var(--muted)]">How weighting works</summary>
        <p className="pb-4 text-xs leading-relaxed text-[var(--muted)]">
          Each input is scored from −1 to +1. Contribution = 50 × weight × input score ÷ available weight ({totalWeight}).
          {' '}Score = 50 + all contributions, rounded to one decimal. Missing inputs are excluded and remaining weights are normalised.
          {' '}A neutral direction label can still have a small signed contribution. Displayed contributions are rounded; this score describes rules, not expected returns.
          {isMid ? ` ${MID_SCORE_NOTE}` : ''}
        </p>
      </details>
    </section>
  );
}

function ScoreBar({ score }: { score: number }) {
  const width = Math.min(1, Math.abs(score)) * 50;
  return <div className="relative mt-2 h-1.5 w-full rounded-full bg-[var(--background)]" aria-hidden="true">
    <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--muted)]" />
    <div className="absolute top-0 h-full rounded-full" style={{ width: `${width}%`, background: score > 0 ? 'var(--bull)' : score < 0 ? 'var(--bear)' : 'var(--muted)', left: score >= 0 ? '50%' : `${50 - width}%` }} />
  </div>;
}
