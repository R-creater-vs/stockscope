/**
 * Composes the three horizon engines into one result. Kept separate from
 * `timeframes.ts` (which holds only shared types/helpers) so the engines can
 * import those helpers without a circular dependency back through here.
 */

import type { Bar } from './indicators';
import { analyzeSwing, type SwingAnalysis } from './swing';
import { analyzeMidTerm } from './midterm';
import { analyzeLongTerm } from './longterm';
import type { CompanyData } from './yahoo';
import { inr, type ActionPlan, type TimeframeAnalysis } from './timeframes';

const SHORT_VERDICT: Record<string, string> = {
  STRONG_BUY: 'Strong bullish bias',
  BUY: 'Bullish bias',
  HOLD: 'Mixed evidence',
  AVOID: 'Bearish bias',
};

/** Project the existing swing result onto the shared `TimeframeAnalysis` shape. */
export function swingToTimeframe(a: SwingAnalysis): TimeframeAnalysis {
  const plan = a.plan;
  const buying = a.verdict === 'BUY' || a.verdict === 'STRONG_BUY';

  const action: ActionPlan = plan
    ? {
        headline: buying
          ? `Illustrative entry zone ${inr(plan.entryLow)}–${inr(plan.entryHigh)}; model stop ${inr(plan.stopLoss)}.`
          : a.verdict === 'HOLD'
            ? 'No fresh swing entry — wait for a breakout or a pullback to support.'
            : 'Stand aside; the short-term setup is weak.',
        entryLow: plan.entryLow,
        entryHigh: plan.entryHigh,
        stopLoss: plan.stopLoss,
        target1: plan.target1,
        target2: plan.target2,
        note: `Model risk level ${inr(plan.stopLoss)}. Illustrative targets ${inr(plan.target1)} and ${inr(plan.target2)} are scenarios, not forecasts. Gaps and execution costs can increase losses beyond the stop.`,
      }
    : {
        headline: 'No trade plan — insufficient volatility data.',
        entryLow: null,
        entryHigh: null,
        stopLoss: null,
        target1: null,
        target2: null,
        note: '',
      };

  return {
    timeframe: 'short',
    label: 'Short-term',
    horizon: 'Days to weeks',
    approach: 'Technicals — momentum, breakouts & volume',
    score: a.score,
    verdict: a.verdict,
    verdictLabel: SHORT_VERDICT[a.verdict],
    confidence: a.confidence,
    confidenceLabel: a.confidenceLabel,
    signals: a.signals,
    bullPoints: a.bullPoints,
    bearPoints: a.bearPoints,
    riskFlags: a.riskFlags,
    summary: shortSummary(a),
    action,
    tradePlan: a.plan,
  };
}

function shortSummary(a: SwingAnalysis): string {
  const s = a.snapshot;
  const verb =
    a.verdict === 'STRONG_BUY' || a.verdict === 'BUY'
      ? 'a bullish direction in the weighted rules'
      : a.verdict === 'HOLD'
        ? 'mixed short-term evidence'
        : 'a bearish direction in the weighted rules';
  const bits: string[] = [];
  if (s.rsi14 !== null) bits.push(`RSI ${s.rsi14.toFixed(0)}`);
  if (s.adx14 !== null)
    bits.push(s.adx14 > 25 ? `a trending tape (ADX ${s.adx14.toFixed(0)})` : `a choppy tape (ADX ${s.adx14.toFixed(0)})`);
  return `The short-term score is ${a.score}/100: ${verb}${bits.length ? `, with ${bits.join(' and ')}` : ''}.`;
}

export interface Timeframes {
  short: TimeframeAnalysis;
  mid: TimeframeAnalysis;
  long: TimeframeAnalysis;
}

/**
 * All three horizons for a stock. `swing` can be passed in when the caller has
 * already built it (the analyze route mutates its risk flags first), otherwise
 * it is computed here.
 */
export function analyzeAllTimeframes(
  bars: Bar[],
  company: CompanyData,
  swing?: SwingAnalysis,
): Timeframes {
  const swingAnalysis = swing ?? analyzeSwing(bars);
  return {
    short: swingToTimeframe(swingAnalysis),
    mid: analyzeMidTerm(bars),
    long: analyzeLongTerm(bars, company.fundamentals),
  };
}
