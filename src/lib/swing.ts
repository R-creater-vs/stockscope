/**
 * Swing-trading analysis engine (holding period: days to weeks).
 *
 * Every number shown to the user is computed here, deterministically, from the
 * price series. The LLM layer only *narrates* this output — it never produces a
 * figure of its own. That separation is deliberate: a hallucinated RSI is worse
 * than no RSI.
 */

import {
  Bar,
  adx,
  at,
  atr,
  bollinger,
  donchian,
  ema,
  last,
  macd,
  obv,
  pivotLevels,
  resampleWeekly,
  roc,
  rsi,
  sma,
} from './indicators';

export type Direction = 'bullish' | 'bearish' | 'neutral';
export type Verdict = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID';

/** Technical categories plus the fundamental ones the long-term engine uses. */
export type SignalCategory =
  | 'Trend'
  | 'Momentum'
  | 'Volume'
  | 'Volatility'
  | 'Structure'
  | 'Valuation'
  | 'Quality'
  | 'Growth'
  | 'Health'
  | 'Ownership';

export interface Signal {
  name: string;
  category: SignalCategory;
  direction: Direction;
  /** -1 (max bearish) .. +1 (max bullish) */
  score: number;
  weight: number;
  /** Plain-English reading, with the actual numbers in it. */
  detail: string;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskReward: number;
  atrPercent: number;
}

/**
 * Shares to buy so that hitting the stop costs exactly `riskPercent` of capital.
 * Kept as a free function rather than a method so `TradePlan` stays JSON-serialisable
 * across the server/client boundary.
 */
export function sharesFor(plan: TradePlan, capital: number, riskPercent: number): number {
  if (plan.riskPerShare <= 0) return 0;
  return Math.floor((capital * (riskPercent / 100)) / plan.riskPerShare);
}

export interface Levels {
  support: number[];
  resistance: number[];
  week52High: number | null;
  week52Low: number | null;
  pctFrom52High: number | null;
  pctFrom52Low: number | null;
}

export interface Snapshot {
  price: number;
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  macdHistPrev: number | null;
  adx14: number | null;
  plusDI: number | null;
  minusDI: number | null;
  atr14: number | null;
  percentB: number | null;
  bandwidth: number | null;
  bandwidthPercentile: number | null;
  volume: number;
  avgVolume20: number | null;
  volumeRatio: number | null;
  obvSlope: number | null;
  roc5: number | null;
  roc20: number | null;
}

export interface HigherTimeframe {
  /** Weekly trend from EMA stacking: is the bigger tide with the trade or against it? */
  trend: Direction;
  rsi14: number | null;
  ema10: number | null;
  ema30: number | null;
  price: number;
  aligned: boolean | null;
  detail: string;
}

export interface SwingAnalysis {
  snapshot: Snapshot;
  signals: Signal[];
  score: number;
  verdict: Verdict;
  confidence: number;
  confidenceLabel: 'Low' | 'Moderate' | 'High';
  weekly: HigherTimeframe | null;
  bullPoints: string[];
  bearPoints: string[];
  riskFlags: string[];
  levels: Levels;
  plan: TradePlan | null;
}

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const inr = (n: number) => `₹${n.toFixed(2)}`;

/** Map a raw value onto -1..+1 given a bearish floor and bullish ceiling. */
function scale(value: number, bearAt: number, bullAt: number): number {
  const t = (value - bearAt) / (bullAt - bearAt);
  return Math.max(-1, Math.min(1, t * 2 - 1));
}

export function analyzeSwing(bars: Bar[]): SwingAnalysis {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const price = closes.at(-1)!;

  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = adx(bars, 14);
  const atrSeries = atr(bars, 14);
  const bb = bollinger(closes, 20);
  const obvSeries = obv(bars);
  const volAvg = sma(volumes, 20);

  const snapshot: Snapshot = {
    price,
    ema20: last(e20),
    ema50: last(e50),
    sma200: last(s200),
    rsi14: last(r),
    macdHist: last(m.histogram),
    macdHistPrev: at(m.histogram, 1),
    adx14: last(a.adx),
    plusDI: last(a.plusDI),
    minusDI: last(a.minusDI),
    atr14: last(atrSeries),
    percentB: last(bb.percentB),
    bandwidth: last(bb.bandwidth),
    bandwidthPercentile: bandwidthPercentile(bb.bandwidth),
    volume: volumes.at(-1)!,
    avgVolume20: last(volAvg),
    volumeRatio: last(volAvg) ? volumes.at(-1)! / last(volAvg)! : null,
    obvSlope: obvSlope(obvSeries, 20),
    roc5: last(roc(closes, 5)),
    roc20: last(roc(closes, 20)),
  };

  const signals = buildSignals(snapshot, bars);

  // Weighted 0..100. Each signal contributes weight * (score+1)/2.
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const raw = signals.reduce((sum, s) => sum + s.weight * ((s.score + 1) / 2), 0);
  const score = totalWeight === 0 ? 50 : (raw / totalWeight) * 100;

  const verdict = toVerdict(score);
  const weekly = analyzeWeekly(bars);
  const { confidence, confidenceLabel } = gaugeConfidence(signals, snapshot, weekly);
  const levels = buildLevels(bars);
  const plan = buildPlan(snapshot, levels);

  return {
    snapshot,
    signals,
    score: Math.round(score * 10) / 10,
    verdict,
    confidence,
    confidenceLabel,
    weekly,
    bullPoints: signals.filter((s) => s.score > 0.25).map((s) => s.detail),
    bearPoints: signals.filter((s) => s.score < -0.25).map((s) => s.detail),
    riskFlags: buildRiskFlags(snapshot, levels, bars),
    levels,
    plan,
  };
}

/**
 * The weekly chart, derived from the same dailies. A daily long that agrees with
 * the weekly trend has the bigger tide behind it; one that fights it is swimming
 * upstream and deserves less confidence. We use a 10/30-week EMA pair — the
 * weekly equivalent of the daily 50/150-ish structure — because a 50-week EMA
 * would need ~5 years of history we don't fetch.
 */
function analyzeWeekly(dailyBars: Bar[]): HigherTimeframe | null {
  const weekly = resampleWeekly(dailyBars);
  if (weekly.length < 32) return null;

  const closes = weekly.map((b) => b.close);
  const price = closes.at(-1)!;
  const e10 = last(ema(closes, 10));
  const e30 = last(ema(closes, 30));
  const wr = last(rsi(closes, 14));

  if (e10 === null || e30 === null) return null;

  const above = price > e10 && e10 > e30;
  const below = price < e10 && e10 < e30;
  const trend: Direction = above ? 'bullish' : below ? 'bearish' : 'neutral';

  return {
    trend,
    rsi14: wr,
    ema10: e10,
    ema30: e30,
    price,
    aligned: trend === 'neutral' ? null : trend === 'bullish',
    detail:
      trend === 'bullish'
        ? `The weekly chart has bullish alignment: price is above the 10-week EMA, which is above the 30-week EMA. This describes agreement across timeframes; it does not establish a trading edge.`
        : trend === 'bearish'
          ? `The weekly chart has bearish alignment: price is below the 10-week EMA, which is below the 30-week EMA. A bullish daily reading would conflict with this weekly structure.`
          : `The weekly price and 10/30-week EMA ordering is mixed. There is no aligned weekly trend under these rules.`,
  };
}

function buildSignals(s: Snapshot, bars: Bar[]): Signal[] {
  const signals: Signal[] = [];
  const { price } = s;

  // --- Trend: where price sits relative to its moving averages ---------------
  if (s.ema20 !== null && s.ema50 !== null) {
    const above20 = price > s.ema20;
    const above50 = price > s.ema50;
    const d20 = ((price - s.ema20) / s.ema20) * 100;
    const score = above20 && above50 ? 1 : !above20 && !above50 ? -1 : above50 ? 0.2 : -0.2;
    signals.push({
      name: 'Price vs moving averages',
      category: 'Trend',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 18,
      detail:
        above20 && above50
          ? `Price ${inr(price)} is above both the 20-EMA (${inr(s.ema20)}) and 50-EMA (${inr(s.ema50)}) — ${pct(d20)} over the 20-EMA. Trend is up on the swing timeframe.`
          : !above20 && !above50
            ? `Price ${inr(price)} is below both the 20-EMA (${inr(s.ema20)}) and 50-EMA (${inr(s.ema50)}). Downtrend — longs are fighting the tape.`
            : `Price ${inr(price)} sits between the 20-EMA (${inr(s.ema20)}) and 50-EMA (${inr(s.ema50)}). Mixed, no clean trend to trade.`,
    });
  }

  // --- Trend: EMA stacking (the classic swing-trader alignment check) --------
  if (s.ema20 !== null && s.ema50 !== null) {
    const gap = ((s.ema20 - s.ema50) / s.ema50) * 100;
    const score = scale(gap, -3, 3);
    signals.push({
      name: '20/50 EMA alignment',
      category: 'Trend',
      direction: gap > 0.5 ? 'bullish' : gap < -0.5 ? 'bearish' : 'neutral',
      score,
      weight: 12,
      detail:
        gap > 0
          ? `The 20-EMA is ${pct(gap)} above the 50-EMA — short-term momentum leads the intermediate trend.`
          : `The 20-EMA is ${pct(gap)} below the 50-EMA — short-term momentum lags the intermediate trend.`,
    });
  }

  // --- Trend strength: ADX tells you whether a trend exists at all -----------
  if (s.adx14 !== null && s.plusDI !== null && s.minusDI !== null) {
    const trending = s.adx14 > 25;
    const bullish = s.plusDI > s.minusDI;
    const strength = Math.min(1, (s.adx14 - 15) / 20);
    const score = trending ? (bullish ? strength : -strength) : 0;
    signals.push({
      name: 'Trend strength (ADX)',
      category: 'Trend',
      direction: !trending ? 'neutral' : bullish ? 'bullish' : 'bearish',
      score,
      weight: 12,
      detail: trending
        ? `ADX is ${s.adx14.toFixed(1)} — a genuine trend, and +DI (${s.plusDI.toFixed(1)}) ${bullish ? 'leads' : 'trails'} -DI (${s.minusDI.toFixed(1)}), so it is a ${bullish ? 'up' : 'down'}trend.`
        : `ADX is ${s.adx14.toFixed(1)} (at or below 25) — this rule does not identify a strong trend. The trend-strength contribution is neutral.`,
    });
  }

  // --- Momentum: RSI. For swing entries, 45-65 rising beats >70 -------------
  if (s.rsi14 !== null) {
    const v = s.rsi14;
    let score: number;
    let detail: string;
    if (v >= 70) {
      score = -0.3;
      detail = `RSI is ${v.toFixed(1)} — above the rule's overbought threshold. The model reduces the score for extended momentum; this does not predict a pullback.`;
    } else if (v >= 55) {
      score = 1;
      detail = `RSI is ${v.toFixed(1)} — in the model's bullish momentum band, below its overbought threshold. This is a rule classification, not evidence of profitable entry timing.`;
    } else if (v >= 45) {
      score = 0.2;
      detail = `RSI is ${v.toFixed(1)} — near the middle of its range, with a small positive contribution under these rules.`;
    } else if (v >= 30) {
      score = -0.6;
      detail = `RSI is ${v.toFixed(1)} — momentum is weak and sellers hold control.`;
    } else {
      score = -0.2;
      detail = `RSI is ${v.toFixed(1)} — below the oversold threshold. The model applies a small negative contribution; oversold does not imply that a recovery will follow.`;
    }
    signals.push({
      name: 'RSI (14)',
      category: 'Momentum',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 14,
      detail,
    });
  }

  // --- Momentum: MACD histogram, and crucially whether it's expanding --------
  if (s.macdHist !== null && s.macdHistPrev !== null) {
    const rising = s.macdHist > s.macdHistPrev;
    const positive = s.macdHist > 0;
    const score = positive ? (rising ? 1 : 0.3) : rising ? -0.3 : -1;
    signals.push({
      name: 'MACD histogram',
      category: 'Momentum',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 14,
      detail: `MACD histogram is ${s.macdHist.toFixed(2)} and ${rising ? 'expanding' : 'contracting'} — ${
        positive && rising
          ? 'bullish momentum is accelerating.'
          : positive && !rising
            ? 'still bullish, but the thrust is fading. Watch for a cross down.'
            : !positive && rising
              ? 'bearish, though the selling pressure is easing — an early turn signal.'
              : 'bearish momentum is accelerating.'
      }`,
    });
  }

  // --- Volume: moves without volume don't hold ------------------------------
  if (s.volumeRatio !== null) {
    const v = s.volumeRatio;
    const up = (s.roc5 ?? 0) > 0;
    // High volume amplifies whichever direction price is already going.
    const magnitude = Math.min(1, (v - 0.8) / 1.2);
    const score = v < 0.7 ? -0.3 : up ? magnitude : -magnitude;
    signals.push({
      name: 'Volume confirmation',
      category: 'Volume',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 12,
      detail:
        v >= 1.5
          ? `Volume is ${v.toFixed(2)}x the 20-day average on a ${up ? 'up' : 'down'} move — heavy participation ${up ? 'confirms the advance' : 'confirms the decline'}.`
          : v < 0.7
            ? `Volume is ${v.toFixed(2)}x the 20-day average — below-average participation. The model applies a negative contribution for low volume.`
            : `Volume is ${v.toFixed(2)}x the 20-day average — unremarkable, neither confirming nor contradicting the move.`,
    });
  }

  // --- Volatility: Bollinger position and squeeze ---------------------------
  if (s.percentB !== null && s.bandwidthPercentile !== null) {
    const squeeze = s.bandwidthPercentile < 0.2;
    const b = s.percentB;
    const score = squeeze ? 0.3 : b > 1 ? -0.2 : b > 0.6 ? 0.6 : b < 0 ? -0.4 : b < 0.4 ? -0.5 : 0;
    signals.push({
      name: 'Bollinger position',
      category: 'Volatility',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 8,
      detail: squeeze
        ? `Bollinger bandwidth is in the tightest ${Math.round(s.bandwidthPercentile * 100)}% of the past year — a volatility squeeze. The existing rule adds a small positive contribution, although compression alone does not determine the next direction.`
        : b > 1
          ? `Price has closed above the upper Bollinger band. The model reduces the score for extension; it does not establish the likelihood of a reversal.`
          : b < 0
            ? `Price has closed below the lower Bollinger band — capitulation territory; oversold but falling.`
            : `Price sits at ${Math.round(b * 100)}% of the Bollinger range (0 = lower band, 100 = upper).`,
    });
  }

  // --- Structure: 20-day breakout, the bread-and-butter swing trigger --------
  const dc = donchian(bars, 20);
  if (dc) {
    const range = dc.high - dc.low;
    const posInRange = range === 0 ? 0.5 : (price - dc.low) / range;
    const brokeOut = price > dc.high;
    const brokeDown = price < dc.low;
    const score = brokeOut ? 1 : brokeDown ? -1 : scale(posInRange, 0.2, 0.85);
    signals.push({
      name: '20-day range position',
      category: 'Structure',
      direction: score > 0.25 ? 'bullish' : score < -0.25 ? 'bearish' : 'neutral',
      score,
      weight: 10,
      detail: brokeOut
        ? `Price is above the previous 20-day high of ${inr(dc.high)} — a breakout under this rule, contributing positively to the score.`
        : brokeDown
          ? `Price is below the previous 20-day low of ${inr(dc.low)} — a breakdown under this rule, contributing negatively to the score.`
          : `Price is ${Math.round(posInRange * 100)}% of the way up its 20-day range (${inr(dc.low)}–${inr(dc.high)}). A move above ${inr(dc.high)} would meet this rule's breakout condition.`,
    });
  }

  return signals;
}

function toVerdict(score: number): Verdict {
  if (score >= 72) return 'STRONG_BUY';
  if (score >= 58) return 'BUY';
  if (score >= 40) return 'HOLD';
  return 'AVOID';
}

/**
 * Confidence is about signal *agreement* and trend clarity, not about how
 * bullish we are. Eight indicators all pointing the same way in a strong trend
 * is high confidence; the same score assembled from contradictory signals in a
 * choppy tape is not.
 */
function gaugeConfidence(signals: Signal[], s: Snapshot, weekly: HigherTimeframe | null) {
  const directional = signals.filter((x) => x.direction !== 'neutral');
  const bull = directional.filter((x) => x.direction === 'bullish').length;
  const bear = directional.filter((x) => x.direction === 'bearish').length;
  const total = directional.length || 1;
  const agreement = Math.abs(bull - bear) / total;
  const dailyBullish = bull >= bear;

  // Chop is the enemy of swing trading — penalise a weak ADX hard.
  const trendClarity = s.adx14 === null ? 0.5 : Math.min(1, Math.max(0, (s.adx14 - 12) / 23));

  let confidence = (agreement * 0.6 + trendClarity * 0.4) * 100;

  // Higher-timeframe agreement modifies rule confidence, not expected returns.
  // A bounded ±12 nudge keeps it a modifier, not an override of the daily read.
  if (weekly && weekly.aligned !== null) {
    if (weekly.aligned === dailyBullish) confidence += 12;
    else confidence -= 12;
  }
  confidence = Math.round(Math.max(0, Math.min(100, confidence)));

  return {
    confidence,
    confidenceLabel: (confidence >= 65 ? 'High' : confidence >= 40 ? 'Moderate' : 'Low') as
      | 'Low'
      | 'Moderate'
      | 'High',
  };
}

function buildLevels(bars: Bar[]): Levels {
  const { support, resistance } = pivotLevels(bars, 5, 4);
  const yearBars = bars.slice(-252);
  const week52High = yearBars.length ? Math.max(...yearBars.map((b) => b.high)) : null;
  const week52Low = yearBars.length ? Math.min(...yearBars.map((b) => b.low)) : null;
  const price = bars.at(-1)!.close;

  return {
    support,
    resistance,
    week52High,
    week52Low,
    pctFrom52High: week52High ? ((price - week52High) / week52High) * 100 : null,
    pctFrom52Low: week52Low ? ((price - week52Low) / week52Low) * 100 : null,
  };
}

/**
 * ATR-based trade plan. The stop is placed beyond the noise (1.5x ATR) or under
 * the nearest support, whichever is further — a stop inside the daily range is
 * a stop that gets hit for no reason.
 */
function buildPlan(s: Snapshot, levels: Levels): TradePlan | null {
  if (s.atr14 === null || s.atr14 <= 0) return null;

  const { price, atr14 } = s;
  const entryLow = price - 0.3 * atr14;
  const entryHigh = price + 0.2 * atr14;
  const entry = price;

  const atrStop = price - 1.5 * atr14;
  const nearestSupport = levels.support[0];
  const stopLoss =
    nearestSupport && nearestSupport < price
      ? Math.min(atrStop, nearestSupport - 0.25 * atr14)
      : atrStop;

  // Prefer the nearest real resistance as T1 if it offers a sane reward.
  const atrTarget1 = price + 2 * atr14;
  const nearestResistance = levels.resistance[0];
  const target1 =
    nearestResistance && nearestResistance > price + 0.8 * atr14
      ? Math.min(nearestResistance, atrTarget1)
      : atrTarget1;
  const target2 = price + 3.5 * atr14;

  const riskPerShare = entry - stopLoss;
  const rewardPerShare = target1 - entry;

  return {
    entryLow,
    entryHigh,
    stopLoss,
    target1,
    target2,
    riskPerShare,
    rewardPerShare,
    riskReward: riskPerShare > 0 ? rewardPerShare / riskPerShare : 0,
    atrPercent: (atr14 / price) * 100,
  };
}

function buildRiskFlags(s: Snapshot, levels: Levels, bars: Bar[]): string[] {
  const flags: string[] = [];

  if (s.atr14 !== null) {
    const atrPct = (s.atr14 / s.price) * 100;
    if (atrPct > 4)
      flags.push(
        `High volatility: ATR is ${atrPct.toFixed(1)}% of price. Daily swings are wide — size the position smaller than usual.`,
      );
  }
  if (s.adx14 !== null && s.adx14 < 20)
    flags.push(
      `Weak trend reading: ADX ${s.adx14.toFixed(1)} is below this model's trend threshold. A directional setup has less trend clarity.`,
    );
  if (s.rsi14 !== null && s.rsi14 > 75)
    flags.push(`Overbought: RSI ${s.rsi14.toFixed(1)}. Momentum is extended under this rule; the reading does not predict when a reversal will occur.`);
  if (levels.pctFrom52Low !== null && levels.pctFrom52Low < 8)
    flags.push(
      `Near 52-week low (${levels.pctFrom52Low.toFixed(1)}% above it). Proximity to the low does not establish support or guarantee a recovery.`,
    );
  if (s.avgVolume20 !== null && s.avgVolume20 < 100_000)
    flags.push(
      `Thin liquidity: 20-day average volume is only ${Math.round(s.avgVolume20).toLocaleString('en-IN')} shares. Slippage on entry and exit will hurt.`,
    );

  // A gap larger than 5% in the last week usually means news we can't see here.
  const recent = bars.slice(-5);
  for (let i = 1; i < recent.length; i++) {
    const gap = ((recent[i].open - recent[i - 1].close) / recent[i - 1].close) * 100;
    if (Math.abs(gap) > 5) {
      flags.push(
        `A ${pct(gap)} gap occurred on ${recent[i].date} — check for news, results, or corporate action before trading this.`,
      );
      break;
    }
  }

  return flags;
}

/** Where today's Bollinger bandwidth ranks against the past year — squeeze detection. */
function bandwidthPercentile(bw: (number | null)[]): number | null {
  const vals = bw.slice(-252).filter((v): v is number => v !== null);
  if (vals.length < 30) return null;
  const current = vals.at(-1)!;
  const below = vals.filter((v) => v < current).length;
  return below / vals.length;
}

/** Normalised slope of OBV over `period` bars: is smart money accumulating? */
function obvSlope(series: number[], period: number): number | null {
  if (series.length < period + 1) return null;
  const start = series[series.length - 1 - period];
  const end = series.at(-1)!;
  const scaleBy = Math.max(...series.slice(-period).map(Math.abs)) || 1;
  return (end - start) / scaleBy;
}
