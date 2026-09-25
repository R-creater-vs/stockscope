'use client';

import { useId, useState, type ReactNode } from 'react';
import { sharesFor, type TradePlan, type Verdict } from '@/lib/swing';
import { inr, num } from '@/lib/format';

interface Props {
  plan: TradePlan;
  verdict: Verdict;
  price: number;
}

export default function TradePlanCard({ plan, verdict, price }: Props) {
  const [capital, setCapital] = useState(100_000);
  const [riskPct, setRiskPct] = useState(1);
  const sizingNoteId = useId();

  const shares = sharesFor(plan, capital, riskPct);
  const deployed = shares * price;
  const plannedLoss = shares * plan.riskPerShare;
  const gainAtT1 = shares * plan.rewardPerShare;

  const rrColor =
    plan.riskReward >= 2 ? 'var(--bull)' : plan.riskReward >= 1.3 ? 'var(--warn)' : 'var(--bear)';

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-lg font-semibold tracking-tight">An illustrative trade plan</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Levels derived from ATR ({plan.atrPercent.toFixed(1)}% of price) and nearby structure.
          {' '}Targets are scenarios, not forecasts.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
        <Cell label="Entry zone" value={<><span className="block">{inr(plan.entryLow)}</span><span className="block"><span className="text-xs font-normal text-[var(--muted)]">to </span>{inr(plan.entryHigh)}</span></>} />
        <Cell label="Model stop" value={inr(plan.stopLoss)} color="var(--bear)" />
        <Cell label="Target 1" value={inr(plan.target1)} color="var(--bull)" />
        <Cell label="Target 2" value={inr(plan.target2)} color="var(--bull)" />
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[var(--border)] px-5 py-3 text-sm">
        <span className="text-[var(--muted)]">
          Risk / share <span className="tnum text-[var(--foreground)]">{inr(plan.riskPerShare)}</span>
        </span>
        <span className="text-[var(--muted)]">
          Target 1 reward / share{' '}
          <span className="tnum text-[var(--foreground)]">{inr(plan.rewardPerShare)}</span>
        </span>
        <span className="text-[var(--muted)]">
          Reward : Risk{' '}
          <span className="tnum font-semibold" style={{ color: rrColor }}>
            {plan.riskReward.toFixed(2)} : 1
          </span>
        </span>
      </div>

      {/* Position sizing is the part most retail traders skip, so it's inline
          rather than hidden behind a calculator link. */}
      <div className="px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Position sizing
        </h3>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--muted)]">Capital (₹)</span>
            <input
              type="number"
              value={capital}
              min={0}
              max={1_000_000_000_000}
              step={10000}
              aria-describedby={sizingNoteId}
              onChange={(e) => { const value = Number(e.target.value); setCapital(Number.isFinite(value) ? Math.min(1_000_000_000_000, Math.max(0, value)) : 0); }}
              className="tnum min-h-11 w-36 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--muted)]">Risk per trade (%)</span>
            <input
              type="number"
              value={riskPct}
              min={0.1}
              max={10}
              step={0.25}
              aria-describedby={sizingNoteId}
              onChange={(e) => { const value = Number(e.target.value); setRiskPct(Number.isFinite(value) ? Math.min(10, Math.max(0.1, value)) : 0.1); }}
              className="tnum min-h-11 w-28 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Shares" value={num(shares, 0)} />
          <Stat label="Capital deployed" value={inr(deployed, 0)} />
          <Stat label="Planned loss at stop" value={inr(plannedLoss, 0)} color="var(--bear)" />
          <Stat label="Scenario gain at T1" value={inr(gainAtT1, 0)} color="var(--bull)" />
        </div>
        <p id={sizingNoteId} className="mt-4 text-xs leading-relaxed text-[var(--muted)]">Sizing uses the model&apos;s risk per share. Actual entry fills may differ from this quote. These amounts exclude fees and slippage; gaps can make losses larger than the planned stop loss.</p>
        {deployed > capital && <p role="status" className="mt-3 rounded-lg border border-[var(--warn)]/40 px-3 py-3 text-sm text-[var(--warn)]">This risk-based quantity requires {inr(deployed, 0)}, exceeding the {inr(capital, 0)} capital entered. It is not a funded position. Reduce the risk input or quantity before considering this scenario.</p>}

        {verdict === 'AVOID' || verdict === 'HOLD' ? (
          <p className="mt-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-3 py-2 text-xs text-[var(--muted)]">
            The weighted evidence is {verdict === 'AVOID' ? 'bearish' : 'mixed'}. These model levels are for research, not a recommendation to open a position.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Cell({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface)] px-4 py-4 sm:px-5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-1 break-words text-base font-semibold sm:text-lg" style={color ? { color, overflowWrap: 'anywhere' } : { overflowWrap: 'anywhere' }}>
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5 break-words text-base font-medium" style={color ? { color, overflowWrap: 'anywhere' } : { overflowWrap: 'anywhere' }}>
        {value}
      </p>
    </div>
  );
}
