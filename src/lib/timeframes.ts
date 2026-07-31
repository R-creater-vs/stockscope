/**
 * Multi-horizon analysis. The same stock is read three ways, because "should I
 * buy this?" has three different answers depending on how long you intend to
 * hold:
 *
 *   - short  (days to weeks)   — technicals: momentum, breakouts   [swing engine]
 *   - mid    (weeks to months) — trend-following: 50/200 regime, weekly trend
 *   - long   (months to years) — fundamentals: valuation, quality, growth, health
 *
 * All three produce the same `TimeframeAnalysis` shape so one set of UI renders
 * any of them. Every number is still computed deterministically here; the LLM
 * only ever narrates.
 */

import type { Signal, TradePlan, Verdict } from './swing';

export type Timeframe = 'short' | 'mid' | 'long';

export interface ActionPlan {
  /** One-line, horizon-appropriate instruction. */
  headline: string;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  note: string;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  label: string; // "Short-term"
  horizon: string; // "Days to weeks"
  approach: string; // "Technicals — momentum & breakouts"
  score: number; // 0..100
  verdict: Verdict;
  /** Horizon-appropriate wording for the verdict, e.g. "Accumulate" for long. */
  verdictLabel: string;
  confidence: number;
  confidenceLabel: 'Low' | 'Moderate' | 'High';
  signals: Signal[];
  bullPoints: string[];
  bearPoints: string[];
  riskFlags: string[];
  summary: string;
  action: ActionPlan;
  /** Trade plan for short/mid; null for long (which accumulates, not trades). */
  tradePlan: TradePlan | null;
  /** Set when the horizon's data was thin (e.g. sparse fundamentals). */
  dataNote?: string;
}

/* ------------------------------------------------------------- shared math */

/** Verdict thresholds, shared so the three engines stay comparable. */
export function toVerdict(score: number): Verdict {
  if (score >= 72) return 'STRONG_BUY';
  if (score >= 58) return 'BUY';
  if (score >= 40) return 'HOLD';
  return 'AVOID';
}

/** Weighted 0..100 from a signal set. Each signal contributes weight·(score+1)/2. */
export function scoreSignals(signals: Signal[]): number {
  const total = signals.reduce((s, x) => s + x.weight, 0);
  if (total === 0) return 50;
  const raw = signals.reduce((s, x) => s + x.weight * ((x.score + 1) / 2), 0);
  return Math.round((raw / total) * 1000) / 10;
}

export function confidenceLabel(n: number): 'Low' | 'Moderate' | 'High' {
  return n >= 65 ? 'High' : n >= 40 ? 'Moderate' : 'Low';
}

/**
 * Confidence from how much the signals agree and how strong the trend is —
 * `clarity` is a 0..1 caller-supplied trend-strength term (ADX for technicals,
 * data-completeness for fundamentals).
 */
export function gaugeConfidence(signals: Signal[], clarity: number): number {
  const directional = signals.filter((x) => x.direction !== 'neutral');
  const bull = directional.filter((x) => x.direction === 'bullish').length;
  const bear = directional.filter((x) => x.direction === 'bearish').length;
  const total = directional.length || 1;
  const agreement = Math.abs(bull - bear) / total;
  return Math.round(Math.max(0, Math.min(100, (agreement * 0.6 + clarity * 0.4) * 100)));
}

export const directionOf = (score: number): Signal['direction'] =>
  score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral';

/** Map a raw value onto -1..+1 given a bearish floor and a bullish ceiling. */
export function scale(value: number, bearAt: number, bullAt: number): number {
  const t = (value - bearAt) / (bullAt - bearAt);
  return Math.max(-1, Math.min(1, t * 2 - 1));
}

export const inr = (n: number) => `₹${n.toFixed(2)}`;
export const pctStr = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
