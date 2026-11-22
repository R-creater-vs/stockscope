/**
 * Mid-term / position-trading engine (holding period: weeks to months).
 *
 * Where the swing engine cares about this week's momentum, this one cares about
 * the primary trend: the 50/200-day regime, the weekly chart, and multi-month
 * momentum. Noise that matters to a swing trader (a single overbought day) is
 * deliberately down-weighted here.
 *
 * The plain-language rule sentences shown in the report live in `midRules.ts`;
 * update them with any change here. The stored validation record in
 * `validation.ts` describes exactly these rules, so changing a weight or
 * threshold also requires re-running the study before showing that record.
 */

import {
  adx,
  atr,
  ema,
  last,
  pivotLevels,
  resampleWeekly,
  rsi,
  roc,
  sma,
} from './indicators';
import type { Bar } from './indicators';
import type { Signal } from './swing';
import {
  confidenceLabel,
  directionOf,
  gaugeConfidence,
  inr,
  pctStr,
  scale,
  scoreSignals,
  toVerdict,
  type ActionPlan,
  type TimeframeAnalysis,
} from './timeframes';

export function analyzeMidTerm(bars: Bar[]): TimeframeAnalysis {
  const closes = bars.map((b) => b.close);
  const price = closes.at(-1)!;

  const s50 = last(sma(closes, 50));
  const s200 = last(sma(closes, 200));
  const a = adx(bars, 14);
  const adxV = last(a.adx);
  const plusDI = last(a.plusDI);
  const minusDI = last(a.minusDI);
  const r = last(rsi(closes, 14));
  const roc63 = last(roc(closes, 63)); // ~3 months
  const roc126 = last(roc(closes, 126)); // ~6 months
  const atr14 = last(atr(bars, 14));

  const yearBars = bars.slice(-252);
  const w52High = yearBars.length ? Math.max(...yearBars.map((b) => b.high)) : null;
  const w52Low = yearBars.length ? Math.min(...yearBars.map((b) => b.low)) : null;

  // Weekly trend from the same dailies.
  const weekly = resampleWeekly(bars);
  const wCloses = weekly.map((b) => b.close);
  const we10 = weekly.length >= 32 ? last(ema(wCloses, 10)) : null;
  const we30 = weekly.length >= 32 ? last(ema(wCloses, 30)) : null;

  const signals: Signal[] = [];

  // --- Primary trend: price vs the 50 and 200-day SMAs -----------------------
  if (s50 !== null && s200 !== null) {
    const above50 = price > s50;
    const above200 = price > s200;
    const score = above50 && above200 ? 1 : !above50 && !above200 ? -1 : above200 ? 0.3 : -0.3;
    signals.push({
      name: 'Price vs 50 & 200-day SMA',
      category: 'Trend',
      direction: directionOf(score),
      score,
      weight: 20,
      detail:
        above50 && above200
          ? `Price ${inr(price)} is above both the 50-day (${inr(s50)}) and 200-day (${inr(s200)}) SMAs — the rule's strongest trend reading.`
          : !above50 && !above200
            ? `Price ${inr(price)} is below both the 50-day (${inr(s50)}) and 200-day (${inr(s200)}) SMAs — a bearish primary trend reading.`
            : `Price ${inr(price)} is on one side of its 50-day but the other of its 200-day — the trend is in transition.`,
    });
  }

  // --- Golden / death cross: 50 vs 200 ---------------------------------------
  if (s50 !== null && s200 !== null) {
    const gap = ((s50 - s200) / s200) * 100;
    const score = scale(gap, -8, 8);
    signals.push({
      name: '50/200 SMA structure',
      category: 'Trend',
      direction: gap > 1 ? 'bullish' : gap < -1 ? 'bearish' : 'neutral',
      score,
      weight: 16,
      detail:
        gap >= 0
          ? `The 50-day SMA is ${pctStr(gap)} above the 200-day (a golden-cross regime) — the intermediate trend leads the long one.`
          : `The 50-day SMA is ${pctStr(gap)} below the 200-day — the intermediate trend trails the longer trend.`,
    });
  }

  // --- Weekly trend ----------------------------------------------------------
  if (we10 !== null && we30 !== null) {
    const wPrice = wCloses.at(-1)!;
    const up = wPrice > we10 && we10 > we30;
    const down = wPrice < we10 && we10 < we30;
    const score = up ? 1 : down ? -1 : 0;
    signals.push({
      name: 'Weekly trend',
      category: 'Trend',
      direction: directionOf(score),
      score,
      weight: 16,
      detail: up
        ? `The weekly chart has bullish ordering: price above the 10-week EMA, which is above the 30-week EMA.`
        : down
          ? `The weekly chart has bearish ordering: price below the 10-week EMA, which is below the 30-week EMA. A bullish daily reading would conflict with this weekly structure.`
          : `The weekly ordering is mixed: price and the 10- and 30-week EMAs are not stacked in either direction.`,
    });
  }

  // --- Trend strength (ADX) --------------------------------------------------
  if (adxV !== null && plusDI !== null && minusDI !== null) {
    const trending = adxV > 22;
    const bullish = plusDI > minusDI;
    const strength = Math.min(1, (adxV - 15) / 20);
    const score = trending ? (bullish ? strength : -strength) : 0;
    signals.push({
      name: 'Trend strength (ADX)',
      category: 'Trend',
      direction: !trending ? 'neutral' : bullish ? 'bullish' : 'bearish',
      score,
      weight: 12,
      detail: trending
        ? `ADX ${adxV.toFixed(1)} is above the rule's 22 threshold, so the rule treats the stock as trending; +DI ${plusDI.toFixed(1)} vs −DI ${minusDI.toFixed(1)} makes it an ${bullish ? 'up' : 'down'}trend reading.`
        : `ADX ${adxV.toFixed(1)} is at or below the rule's 22 threshold, so the trend-strength input is 0: no trending state under this rule.`,
    });
  }

  // --- Multi-month momentum --------------------------------------------------
  if (roc63 !== null && roc126 !== null) {
    const avg = (roc63 + roc126) / 2;
    const score = scale(avg, -20, 25);
    signals.push({
      name: '3 & 6-month momentum',
      category: 'Momentum',
      direction: directionOf(score),
      score,
      weight: 14,
      detail: `The stock is ${pctStr(roc63)} over three months and ${pctStr(roc126)} over six — ${
        avg > 8 ? 'strong medium-term momentum' : avg < -8 ? 'persistent medium-term weakness' : 'roughly flat over the medium term'
      }.`,
    });
  }

  // --- RSI (position-tuned: only extremes matter) ----------------------------
  if (r !== null) {
    const score = r >= 80 ? -0.3 : r >= 50 ? 0.5 : r >= 40 ? 0.1 : r >= 30 ? -0.4 : -0.2;
    signals.push({
      name: 'RSI (14)',
      category: 'Momentum',
      direction: directionOf(score),
      score,
      weight: 8,
      detail:
        r >= 80
          ? `RSI ${r.toFixed(1)} is above the rule's overbought threshold. The score penalises this extension; it does not predict a pullback.`
          : r < 30
            ? `RSI ${r.toFixed(1)} is below 30. The rule assigns a small negative input; an oversold reading does not imply a recovery.`
            : `RSI ${r.toFixed(1)} is unremarkable for the medium term — neither stretched nor washed out.`,
    });
  }

  // --- Position within the 52-week range -------------------------------------
  if (w52High !== null && w52Low !== null && w52High > w52Low) {
    const posInRange = (price - w52Low) / (w52High - w52Low);
    const score = scale(posInRange, 0.25, 0.9);
    signals.push({
      name: 'Position in 52-week range',
      category: 'Structure',
      direction: directionOf(score),
      score,
      weight: 14,
      detail: `Price sits at ${Math.round(posInRange * 100)}% of its 52-week range (${inr(w52Low)}–${inr(w52High)}). The rule assigns more positive weight to positions higher in this range; it does not establish persistence.`,
    });
  }

  const score = scoreSignals(signals);
  const verdict = toVerdict(score);
  const clarity = adxV === null ? 0.5 : Math.min(1, Math.max(0, (adxV - 12) / 23));
  const confidence = gaugeConfidence(signals, clarity);

  const riskFlags = buildRiskFlags(price, s200, atr14, w52Low);
  const { action, tradePlan } = buildActionAndPlan(bars, price, s50, atr14, verdict);
  const summary = buildSummary(price, verdict, score, s50, s200, roc63, adxV);

  return {
    timeframe: 'mid',
    label: 'Mid-term',
    horizon: 'Weeks to months',
    approach: 'Trend-following — 50/200 regime, weekly trend & momentum',
    score,
    verdict,
    verdictLabel: MID_VERDICT[verdict],
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    signals,
    bullPoints: signals.filter((x) => x.score > 0.25).map((x) => x.detail),
    bearPoints: signals.filter((x) => x.score < -0.25).map((x) => x.detail),
    riskFlags,
    summary,
    action,
    tradePlan,
  };
}

const MID_VERDICT: Record<string, string> = {
  STRONG_BUY: 'Strong bullish bias',
  BUY: 'Bullish bias',
  HOLD: 'Mixed evidence',
  AVOID: 'Bearish bias',
};

/** Wider than the swing plan: position trades breathe more and aim further. */
function buildActionAndPlan(
  bars: Bar[],
  price: number,
  s50: number | null,
  atr14: number | null,
  verdict: string,
) {
  if (atr14 === null || atr14 <= 0) {
    return {
      action: {
        headline: 'Not enough volatility data for a position plan.',
        entryLow: null,
        entryHigh: null,
        stopLoss: null,
        target1: null,
        target2: null,
        note: '',
      } as ActionPlan,
      tradePlan: null,
    };
  }

  const { resistance } = pivotLevels(bars, 8, 4);
  const entryLow = price - 0.5 * atr14;
  const entryHigh = price + 0.5 * atr14;
  // Stop under the 50-SMA when it sits below price, else 2.5 ATR.
  const stopLoss = s50 !== null && s50 < price ? Math.min(s50 - 0.5 * atr14, price - 2.5 * atr14) : price - 2.5 * atr14;
  const target1 = resistance[0] && resistance[0] > price + 2 * atr14 ? resistance[0] : price + 4 * atr14;
  const target2 = price + 7 * atr14;

  const risk = price - stopLoss;
  const reward = target1 - price;

  const tradePlan = {
    entryLow,
    entryHigh,
    stopLoss,
    target1,
    target2,
    riskPerShare: risk,
    rewardPerShare: reward,
    riskReward: risk > 0 ? reward / risk : 0,
    atrPercent: (atr14 / price) * 100,
  };

  const buying = verdict === 'BUY' || verdict === 'STRONG_BUY';
  const action: ActionPlan = {
    headline: buying
      ? `Illustrative entry zone ${inr(entryLow)}–${inr(entryHigh)}; model stop ${inr(stopLoss)}.`
      : verdict === 'HOLD'
        ? 'The position rules show mixed evidence.'
        : 'The position rules show bearish primary trend structure.',
    entryLow,
    entryHigh,
    stopLoss,
    target1,
    target2,
    note: `Model risk level ${inr(stopLoss)}; illustrative targets ${inr(target1)} and ${inr(target2)}. These levels are scenarios, not forecasts. Gaps and execution costs can increase losses beyond the stop.`,
  };

  return { action, tradePlan };
}

function buildRiskFlags(
  price: number,
  s200: number | null,
  atr14: number | null,
  w52Low: number | null,
): string[] {
  const flags: string[] = [];
  if (s200 !== null && price < s200)
    flags.push(
      `Below the 200-day SMA (${inr(s200)}). The long-term trend rule does not support the bullish case.`,
    );
  if (atr14 !== null) {
    const atrPct = (atr14 / price) * 100;
    if (atrPct > 4)
      flags.push(`Elevated volatility: ATR is ${atrPct.toFixed(1)}% of price, above the rule's 4% threshold. Wider daily ranges mean a more distant stop and larger possible gaps.`);
  }
  if (w52Low !== null && ((price - w52Low) / w52Low) * 100 < 10)
    flags.push('Trading within 10% of its 52-week low. Proximity to the low does not establish support or imply a recovery.');
  return flags;
}

function buildSummary(
  price: number,
  verdict: string,
  score: number,
  s50: number | null,
  s200: number | null,
  roc63: number | null,
  adxV: number | null,
): string {
  const trend =
    s50 !== null && s200 !== null
      ? price > s50 && price > s200
        ? 'in a primary uptrend above both its 50- and 200-day averages'
        : price < s50 && price < s200
          ? 'in a primary downtrend below both its 50- and 200-day averages'
          : 'in a transitional trend, caught between its 50- and 200-day averages'
      : 'building its trend';

  const mom = roc63 !== null ? ` It is ${pctStr(roc63)} over the last three months.` : '';
  const strength =
    adxV !== null
      ? adxV > 22
        ? ' ADX is above 22, so the trend-strength rule is active.'
        : ' ADX is at or below 22, so the trend-strength rule is neutral.'
      : '';

  const verb =
    verdict === 'STRONG_BUY' || verdict === 'BUY'
      ? 'The weighted position rules have a bullish bias. This describes the current inputs, not expected returns.'
      : verdict === 'HOLD'
        ? 'The weighted position rules show mixed evidence.'
        : 'The weighted position rules have a bearish bias. This does not forecast a decline.';

  return `On a weeks-to-months horizon, ${price ? `at ${inr(price)} ` : ''}the stock is ${trend}, scoring ${score}/100 on the mid-term checks.${mom}${strength} ${verb}`;
}
