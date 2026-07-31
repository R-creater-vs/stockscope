'use client';

import { useState } from 'react';
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

  const shares = sharesFor(plan, capital, riskPct);
  const deployed = shares * price;
  const maxLoss = shares * plan.riskPerShare;
  const gainAtT1 = shares * plan.rewardPerShare;

  const rrColor =
    plan.riskReward >= 2 ? 'var(--bull)' : plan.riskReward >= 1.3 ? 'var(--warn)' : 'var(--bear)';

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Trade plan</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Levels derived from ATR ({plan.atrPercent.toFixed(1)}% of price) and nearby structure.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
        <Cell label="Entry zone" value={`${inr(plan.entryLow)} – ${inr(plan.entryHigh)}`} />
        <Cell label="Stop loss" value={inr(plan.stopLoss)} color="var(--bear)" />
        <Cell label="Target 1" value={inr(plan.target1)} color="var(--bull)" />
        <Cell label="Target 2" value={inr(plan.target2)} color="var(--bull)" />
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[var(--border)] px-5 py-3 text-sm">
        <span className="text-[var(--muted)]">
          Risk / share <span className="tnum text-[var(--foreground)]">{inr(plan.riskPerShare)}</span>
        </span>
        <span className="text-[var(--muted)]">
          Reward / share{' '}
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
              min={1000}
              step={10000}
              onChange={(e) => setCapital(Math.max(0, Number(e.target.value)))}
              className="tnum w-36 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
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
              onChange={(e) => setRiskPct(Math.max(0.1, Number(e.target.value)))}
              className="tnum w-28 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Shares" value={num(shares, 0)} />
          <Stat label="Capital deployed" value={inr(deployed, 0)} />
          <Stat label="Max loss at stop" value={inr(maxLoss, 0)} color="var(--bear)" />
          <Stat label="Gain at target 1" value={inr(gainAtT1, 0)} color="var(--bull)" />
        </div>

        {verdict === 'AVOID' || verdict === 'HOLD' ? (
          <p className="mt-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-3 py-2 text-xs text-[var(--muted)]">
            These levels are shown for reference only. The engine&apos;s verdict is{' '}
            <span className="font-semibold text-[var(--warn)]">{verdict}</span> — it is not
            suggesting you open this position today.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[var(--surface)] px-5 py-4">
      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5 text-base font-medium" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
