'use client';

import { useMemo, useState } from 'react';
import type { TradePlan, Verdict } from '@/lib/swing';
import type { Timeframe } from '@/lib/timeframes';
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
    good: { border: 'var(--border)', bg: 'var(--surface-2)', label: 'Within the model’s size thresholds', color: 'var(--foreground)' },
    caution: { border: 'var(--border)', bg: 'var(--surface-2)', label: 'Review the model cautions', color: 'var(--warn)' },
    bad: { border: 'var(--border)', bg: 'var(--surface-2)', label: 'Risk flags to review', color: 'var(--bear)' },
  };
  const t = toneStyle[assessment.tone];

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-lg font-semibold tracking-tight">Position scenario</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Model an amount, its concentration and the loss at the planned stop. This is a sizing exercise, not a return forecast.
        </p>
      </header>

      <div className="flex flex-wrap gap-4 px-5 py-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Amount for this stock (₹)</span>
          <input
            type="number"
            value={amount}
            min={0}
            max={1_000_000_000_000}
            step={5000}
            onChange={(e) => { const value = Number(e.target.value); setAmount(Number.isFinite(value) ? Math.min(1_000_000_000_000, Math.max(0, value)) : 0); }}
            className="tnum min-h-11 w-40 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">Your total investable money (₹)</span>
          <input
            type="number"
            value={portfolio}
            min={0}
            max={1_000_000_000_000}
            step={50000}
            onChange={(e) => { const value = Number(e.target.value); setPortfolio(Number.isFinite(value) ? Math.min(1_000_000_000_000, Math.max(0, value)) : 0); }}
            className="tnum min-h-11 w-44 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-base outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>

      {amount > 0 && price > 0 && (
        <>
          <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
            <Cell label="Shares" value={String(assessment.shares)} />
            <Cell label="Scenario amount" value={inr(assessment.invested, 0)} />
            <Cell
              label="Planned loss at stop"
              value={assessment.lossAtStop !== null ? `${inr(assessment.lossAtStop, 0)}` : '—'}
              sub={assessment.stopPct !== null ? `${assessment.stopPct.toFixed(1)}% drop` : 'no stop set'}
              color="var(--bear)"
            />
            <Cell
              label="Scenario gain at T1"
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
                  Planned stop loss{' '}
                  <span
                    className="tnum font-semibold"
                    style={{ color: assessment.accountRisk > 2 ? 'var(--bear)' : 'var(--bull)' }}
                  >
                    {assessment.accountRisk.toFixed(1)}%
                  </span>{' '}
                  of entered capital
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
                {portfolio <= 0 ? 'Portfolio amount missing' : assessment.shares === 0 ? 'Amount below one share' : t.label}
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

            {portfolio > 0 && assessment.invested > portfolio && <p role="status" className="mt-3 text-sm text-[var(--warn)]">The scenario amount exceeds the total capital entered. This calculation does not provide funding or broker execution.</p>}
            {portfolio <= 0 && <p className="mt-3 text-sm text-[var(--muted)]">Enter total capital to calculate concentration and account risk.</p>}
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Loss uses the model&apos;s risk per share; execution can differ from the report quote. Fees, slippage and price gaps can increase actual losses beyond this scenario.
              {' '}{timeframe === 'long' ? 'The fundamental model has not been historically validated.' : 'The weighted technical rules have no demonstrated stable trading edge.'}
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
    reasons.push({ tone: 'bad', text: 'The weighted rules have a bearish bias. Position size does not change the direction of that evidence.' });
    bad = true;
  } else if (verdict === 'HOLD') {
    reasons.push({ tone: 'caution', text: 'The weighted rules show mixed evidence. Any displayed stop and target remain illustrative.' });
    caution = true;
  } else {
    reasons.push({ tone: 'caution', text: 'The weighted rules have a bullish bias. This does not establish a profitable setup or a probability of profit.' });
  }

  // 2) Reward vs risk of the trade itself.
  if (rr !== null) {
    if (rr >= 2) reasons.push({ tone: 'good', text: `Model target reward is ${rr.toFixed(1)} times the planned risk. This ratio does not measure the chance of reaching the target.` });
    else if (rr >= 1.3) reasons.push({ tone: 'caution', text: `Model target reward is ${rr.toFixed(1)} times the planned risk, before costs. Target probability is unknown.` });
    else {
      reasons.push({ tone: 'bad', text: `Model target reward is ${rr.toFixed(1)} times the planned risk, below the model's preferred ratio. Costs reduce this further.` });
      caution = true;
    }
  }

  // 3) Concentration — the single biggest retail mistake.
  if (portfolio > 0) {
    if (concentration > 35) {
      reasons.push({ tone: 'bad', text: `This scenario puts ${concentration.toFixed(0)}% of the entered capital in one stock, above the model's concentration threshold. A gap can materially affect the account.` });
      bad = true;
    } else if (concentration > 20) {
      reasons.push({ tone: 'caution', text: `This scenario puts ${concentration.toFixed(0)}% of the entered capital in one stock. Review concentration alongside other correlated holdings.` });
      caution = true;
    } else {
      reasons.push({ tone: 'good', text: `This scenario uses ${concentration.toFixed(0)}% of the entered capital, within the model's concentration threshold. Other holdings and shared risks are not assessed.` });
    }
  }

  // 4) Account risk — the professional 1–2% rule.
  if (accountRisk !== null) {
    if (accountRisk > 3) {
      reasons.push({ tone: 'bad', text: `Planned stop loss is ${accountRisk.toFixed(1)}% of entered capital, above the model's risk threshold. Actual loss can exceed this.` });
      bad = true;
    } else if (accountRisk > 2) {
      reasons.push({ tone: 'caution', text: `Planned stop loss is ${accountRisk.toFixed(1)}% of entered capital, above the model's lower risk band. Actual loss can exceed this.` });
      caution = true;
    } else {
      reasons.push({ tone: 'good', text: `Planned stop loss is ${accountRisk.toFixed(1)}% of entered capital, within the model's lower risk band. This is not a guaranteed loss limit.` });
    }
  } else if (portfolio > 0 && !plan) {
    reasons.push({ tone: 'caution', text: 'This model supplies no stop, so the planned stop-loss scenario cannot be calculated. Losses remain possible.' });
    caution = true;
  }

  const tone: Tone = bad ? 'bad' : caution ? 'caution' : 'good';
  return { tone, shares, invested, lossAtStop, gainAtT1, stopPct, concentration, accountRisk, reasons };
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-1 break-words text-base font-semibold" style={color ? { color, overflowWrap: 'anywhere' } : { overflowWrap: 'anywhere' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}
