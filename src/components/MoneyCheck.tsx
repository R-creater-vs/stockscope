'use client';

import { useMemo, useState } from 'react';
import type { TradePlan, Verdict } from '@/lib/swing';
import type { Timeframe } from '@/lib/timeframes';
import { validationNote } from '@/lib/validation';
import { inr } from '@/lib/format';

/**
 * "Should I put ₹X into this stock?" — a plain-language risk check on a specific
 * rupee amount, the inverse of the trade plan's share calculator.
 *
 * Crucial honesty line: this judges whether the BET IS SIZED SENSIBLY for its
 * risk (stop distance, concentration, how much of your money is at stake) — it
 * does NOT and cannot tell you the stock will go up. The engine has no proven
 * edge, so the whole point is to keep any single trade small and survivable.
 */

type Tone = 'good' | 'caution' | 'bad';

export default function MoneyCheck({
  price,
  plan,
  verdict,
  timeframe,
}: {
  price: number;
  plan: TradePlan | null;
  verdict: Verdict;
  timeframe: Timeframe;
}) {
  const [amount, setAmount] = useState(50_000);
  const [portfolio, setPortfolio] = useState(500_000);

  const assessment = useMemo(
    () => assess({ amount, portfolio, price, plan, verdict, timeframe }),
    [amount, portfolio, price, plan, verdict, timeframe],
  );

  const toneStyle: Record<Tone, { border: string; bg: string; label: string; color: string }> = {
    good: { border: 'var(--bull)', bg: 'rgba(38,208,124,0.08)', label: 'Reasonably sized', color: 'var(--bull)' },
    caution: { border: 'var(--warn)', bg: 'rgba(246,167,35,0.08)', label: 'Okay — with caveats', color: 'var(--warn)' },
    bad: { border: 'var(--bear)', bg: 'rgba(246,70,93,0.08)', label: 'Rethink this', color: 'var(--bear)' },
  };
  const t = toneStyle[assessment.tone];

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Should I put money in?</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Enter what you&apos;re thinking of investing here — this checks the <em>risk and size</em>,
          not whether the price will rise.
        </p>
      </header>

      <div className="flex flex-wrap gap-4 px-5 py-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Amount for this stock (₹)</span>
          <input
            type="number"
            value={amount}
            min={0}
            step={5000}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="tnum w-40 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Your total investable money (₹)</span>
          <input
            type="number"
            value={portfolio}
            min={0}
            step={50000}
            onChange={(e) => setPortfolio(Math.max(0, Number(e.target.value)))}
            className="tnum w-44 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>

      {amount > 0 && price > 0 && (
        <>
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
            <Cell label="Shares" value={String(assessment.shares)} />
            <Cell label="Actually invested" value={inr(assessment.invested, 0)} />
            <Cell
              label="Loss if stopped out"
              value={assessment.lossAtStop !== null ? `${inr(assessment.lossAtStop, 0)}` : '—'}
              sub={assessment.stopPct !== null ? `${assessment.stopPct.toFixed(1)}% drop` : 'no stop set'}
              color="var(--bear)"
            />
            <Cell
              label="Gain at target 1"
              value={assessment.gainAtT1 !== null ? inr(assessment.gainAtT1, 0) : '—'}
              color="var(--bull)"
            />
          </div>

          {portfolio > 0 && (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[var(--border)] px-5 py-3 text-sm">
              <span className="text-[var(--muted)]">
                Of your money{' '}
                <span className="tnum font-semibold text-[var(--foreground)]">
                  {assessment.concentration.toFixed(0)}%
                </span>{' '}
                in this one stock
              </span>
              {assessment.accountRisk !== null && (
                <span className="text-[var(--muted)]">
                  At-risk if stopped{' '}
                  <span
                    className="tnum font-semibold"
                    style={{ color: assessment.accountRisk > 2 ? 'var(--bear)' : 'var(--bull)' }}
                  >
                    {assessment.accountRisk.toFixed(1)}%
                  </span>{' '}
                  of everything
                </span>
              )}
            </div>
          )}

          <div className="px-5 py-4">
            <div
              className="rounded-lg border px-4 py-3"
              style={{ borderColor: t.border, background: t.bg }}
            >
              <p className="text-sm font-bold uppercase tracking-wider" style={{ color: t.color }}>
                {t.label}
              </p>
              <ul className="mt-2 space-y-1.5">
                {assessment.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--muted)]">
                    <span style={{ color: r.tone === 'bad' ? 'var(--bear)' : r.tone === 'good' ? 'var(--bull)' : 'var(--warn)' }}>
                      {r.tone === 'good' ? '✓' : r.tone === 'bad' ? '✕' : '!'}
                    </span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
              This is a sizing and risk check, not a prediction. No one can tell you a stock will go
              up — the honest job here is making sure a wrong call is small enough to survive. The
              engine&apos;s own track record on this timeframe is{' '}
              <span className="text-[var(--foreground)]">{validationNote(timeframe).status.replace('-', ' ')}</span>.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ logic */

interface Reason {
  tone: Tone;
  text: string;
}
interface Assessment {
  tone: Tone;
  shares: number;
  invested: number;
  lossAtStop: number | null;
  gainAtT1: number | null;
  stopPct: number | null;
  concentration: number;
  accountRisk: number | null;
  reasons: Reason[];
}

function assess({
  amount,
  portfolio,
  price,
  plan,
  verdict,
}: {
  amount: number;
  portfolio: number;
  price: number;
  plan: TradePlan | null;
  verdict: Verdict;
  timeframe: Timeframe;
}): Assessment {
  const shares = price > 0 ? Math.floor(amount / price) : 0;
  const invested = shares * price;

  const stopPct = plan ? ((price - plan.stopLoss) / price) * 100 : null;
  const lossAtStop = plan ? shares * plan.riskPerShare : null;
  const gainAtT1 = plan ? shares * plan.rewardPerShare : null;
  const rr = plan?.riskReward ?? null;

  const concentration = portfolio > 0 ? (invested / portfolio) * 100 : 0;
  const accountRisk = portfolio > 0 && lossAtStop !== null ? (lossAtStop / portfolio) * 100 : null;

  const reasons: Reason[] = [];
  let bad = false;
  let caution = false;

  // 1) What does the engine even think of the stock?
  if (verdict === 'AVOID') {
    reasons.push({ tone: 'bad', text: 'The engine rates this AVOID — it is not a buy candidate right now, at any size.' });
    bad = true;
  } else if (verdict === 'HOLD') {
    reasons.push({ tone: 'caution', text: 'The engine rates this HOLD — no clean entry today, so there is no defined risk to size against.' });
    caution = true;
  } else {
    reasons.push({ tone: 'good', text: `The engine rates this ${verdict.replace('_', ' ')} — a valid setup, if the plan's stop is respected.` });
  }

  // 2) Reward vs risk of the trade itself.
  if (rr !== null) {
    if (rr >= 2) reasons.push({ tone: 'good', text: `Reward:risk is healthy at ${rr.toFixed(1)}:1 — the target is worth the stop.` });
    else if (rr >= 1.3) reasons.push({ tone: 'caution', text: `Reward:risk is only ${rr.toFixed(1)}:1 — acceptable, not generous.` });
    else {
      reasons.push({ tone: 'bad', text: `Reward:risk is thin at ${rr.toFixed(1)}:1 — you'd risk nearly as much as you stand to make.` });
      caution = true;
    }
  }

  // 3) Concentration — the single biggest retail mistake.
  if (portfolio > 0) {
    if (concentration > 35) {
      reasons.push({ tone: 'bad', text: `That's ${concentration.toFixed(0)}% of your money in one stock — dangerously concentrated. A single bad gap could hurt badly.` });
      bad = true;
    } else if (concentration > 20) {
      reasons.push({ tone: 'caution', text: `That's ${concentration.toFixed(0)}% of your money in one stock — a lot. Spreading across 5–8 names is safer.` });
      caution = true;
    } else {
      reasons.push({ tone: 'good', text: `At ${concentration.toFixed(0)}% of your money, this position is diversifiable — no single stock can sink you.` });
    }
  }

  // 4) Account risk — the professional 1–2% rule.
  if (accountRisk !== null) {
    if (accountRisk > 3) {
      reasons.push({ tone: 'bad', text: `If stopped out you'd lose ${accountRisk.toFixed(1)}% of everything on one trade. Professionals cap this near 1–2%.` });
      bad = true;
    } else if (accountRisk > 2) {
      reasons.push({ tone: 'caution', text: `Stopped out, you'd lose ${accountRisk.toFixed(1)}% of your total money — a bit above the 1–2% per-trade guideline.` });
      caution = true;
    } else {
      reasons.push({ tone: 'good', text: `Stopped out, you'd lose ${accountRisk.toFixed(1)}% of your total — within the sensible 1–2% per-trade zone.` });
    }
  } else if (portfolio > 0 && !plan) {
    reasons.push({ tone: 'caution', text: 'With no stop set, there is no defined "worst case" to size against — a reason to wait for a real setup.' });
    caution = true;
  }

  const tone: Tone = bad ? 'bad' : caution ? 'caution' : 'good';
  return { tone, shares, invested, lossAtStop, gainAtT1, stopPct, concentration, accountRisk, reasons };
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="tnum mt-1 text-base font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[var(--muted-2)]">{sub}</p>}
    </div>
  );
}
