/**
 * Deterministic candlestick formations. Pure: no I/O, no dependencies beyond
 * the indicator math.
 *
 * Every formation has a written rule, needs a stated prior-trend context, and
 * carries a confirmation and invalidation rule. A shape alone is not reported
 * as a reversal: a hammer-shaped candle after an advance is a different named
 * formation (hanging man), and the same shape with no prior trend is not named
 * at all. A recognised formation is a description of past bars, not a
 * validated forecast; NIVRA has not tested these rules historically.
 *
 * No look-ahead: detection uses only the formation's bars and the bars before
 * it. Confirmation uses only later bars that have COMPLETED. A formation that
 * ends on a bar still in progress is reported as forming and can never be
 * confirmed by that same bar.
 */

import { sma, type Bar } from './indicators';
import { inr } from './format';

export type PatternDirection = 'bullish' | 'bearish' | 'neutral';
export type PatternTimeframe = 'daily' | 'weekly';
export type PatternStatus =
  | 'forming'
  | 'awaiting'
  | 'confirmed'
  | 'invalidated'
  | 'expired'
  | 'resolved-up'
  | 'resolved-down'
  | 'unresolved';

export interface CandlePattern {
  id: string;
  name: string;
  direction: PatternDirection;
  timeframe: PatternTimeframe;
  /** Bar dates forming the pattern (weekly bars are dated by their Monday). */
  dates: string[];
  /** False while the final bar is in progress; null when that cannot be determined. */
  complete: boolean | null;
  criteria: string[];
  bars: Bar[];
  trendContext: string;
  volumeContext: string;
  detectedOn: string;
  confirmationRule: string;
  invalidationRule: string;
  status: PatternStatus;
  statusDate: string | null;
  statusNote: string;
}

export interface CandleScan {
  timeframe: PatternTimeframe;
  window: string;
  lastBarDate: string | null;
  lastBarComplete: boolean | null;
  patterns: CandlePattern[];
  note: string | null;
}

/** Later completed bars allowed for confirmation, invalidation or resolution. */
export const CONFIRM_BARS = 3;
/** Bars needed before a formation for trend context and average sizes. */
const CONTEXT_BARS = 20;

interface Shape {
  body: number;
  range: number;
  upper: number;
  lower: number;
  bull: boolean;
  bear: boolean;
  top: number;
  bottom: number;
  mid: number;
}

function shape(b: Bar): Shape {
  const top = Math.max(b.open, b.close);
  const bottom = Math.min(b.open, b.close);
  return {
    body: top - bottom,
    range: b.high - b.low,
    upper: b.high - top,
    lower: bottom - b.low,
    bull: b.close > b.open,
    bear: b.close < b.open,
    top,
    bottom,
    mid: (top + bottom) / 2,
  };
}

type PriorTrend = 'decline' | 'advance' | 'none';

const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const times = (a: number, b: number) => (b > 0 ? `${(a / b).toFixed(1)}×` : '—');

/**
 * Weekly candles from daily bars (ISO weeks, Monday key, matching
 * `resampleWeekly`). The final week counts as complete only when its last
 * daily bar is a Friday session that has itself completed. A week cut short by
 * a Friday holiday therefore stays "incomplete" until a later week appears —
 * a conservative rule that never treats a partial week as final.
 */
export function weeklyCandles(daily: Bar[], lastDailyComplete: boolean | null): { bars: Bar[]; lastComplete: boolean | null } {
  const groups = new Map<string, Bar[]>();
  for (const b of daily) {
    const d = new Date(`${b.date}T00:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    const key = d.toISOString().slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(b);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].sort();
  const bars = keys.map((key) => {
    const g = groups.get(key)!;
    return {
      date: key,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
  const lastGroup = keys.length ? groups.get(keys[keys.length - 1])! : [];
  const lastDaily = lastGroup[lastGroup.length - 1];
  let lastComplete: boolean | null = null;
  if (lastDaily) {
    const isFriday = new Date(`${lastDaily.date}T00:00:00Z`).getUTCDay() === 5;
    lastComplete = !isFriday ? false : lastDailyComplete;
  }
  return { bars, lastComplete };
}

interface Detection {
  name: string;
  direction: PatternDirection;
  first: number;
  last: number;
  criteria: string[];
}

export function scanCandles(
  bars: Bar[],
  options: { timeframe: PatternTimeframe; lastBarComplete: boolean | null; window?: number },
): CandleScan {
  const timeframe = options.timeframe;
  const window = options.window ?? (timeframe === 'daily' ? 10 : 6);
  const unit = timeframe === 'daily' ? 'daily' : 'weekly';
  const lastIdx = bars.length - 1;
  const base: CandleScan = {
    timeframe,
    window: `Formations ending in the last ${window} ${unit} bars`,
    lastBarDate: bars[lastIdx]?.date ?? null,
    lastBarComplete: options.lastBarComplete,
    patterns: [],
    note: null,
  };
  if (bars.length < CONTEXT_BARS + 3) {
    return { ...base, note: `Only ${bars.length} ${unit} bars are available; at least ${CONTEXT_BARS + 3} are needed for trend context.` };
  }

  const closes = bars.map((b) => b.close);
  const sma20 = sma(closes, 20);
  // The last bar that is known to be complete. An unknown completion state is
  // treated as incomplete, so it can never confirm or invalidate anything.
  const lastComplete = options.lastBarComplete === true ? lastIdx : lastIdx - 1;

  const priorTrend = (first: number): PriorTrend => {
    const i = first - 1;
    const s = sma20[i];
    if (i < 19 || s === null) return 'none';
    const c = bars[i].close;
    const c10 = bars[i - 10].close;
    if (c < c10 && c < s) return 'decline';
    if (c > c10 && c > s) return 'advance';
    return 'none';
  };
  const avgBody = (first: number) => {
    const win = bars.slice(first - 10, first);
    return win.reduce((s, b) => s + shape(b).body, 0) / win.length;
  };
  const avgRange = (first: number) => {
    const win = bars.slice(first - 10, first);
    return win.reduce((s, b) => s + (b.high - b.low), 0) / win.length;
  };

  const detections: Detection[] = [];
  const start = Math.max(CONTEXT_BARS + 2, lastIdx - window + 1);
  for (let e = start; e <= lastIdx; e++) {
    const c = bars[e];
    const sC = shape(c);

    // --- Single-bar formations ---------------------------------------------
    if (sC.range > 0) {
      const ar = avgRange(e);
      const trend = priorTrend(e);
      if (sC.body <= 0.1 * sC.range && sC.range >= 0.5 * ar) {
        detections.push({
          name: 'Doji',
          direction: 'neutral',
          first: e,
          last: e,
          criteria: [
            `Body ${inr(sC.body)} is ${pctOf(sC.body, sC.range)} of the ${inr(sC.range)} range (rule: at most 10%).`,
            `Range is ${times(sC.range, ar)} the prior 10-bar average range (rule: at least 0.5×, so tiny bars are ignored).`,
          ],
        });
      }
      const smallUpper = sC.upper <= Math.max(0.1 * sC.range, 0.5 * sC.body);
      const smallLower = sC.lower <= Math.max(0.1 * sC.range, 0.5 * sC.body);
      if (sC.body > 0.1 * sC.range && sC.lower >= 2 * sC.body && smallUpper && trend !== 'none') {
        detections.push({
          name: trend === 'decline' ? 'Hammer' : 'Hanging man',
          direction: trend === 'decline' ? 'bullish' : 'bearish',
          first: e,
          last: e,
          criteria: [
            `Lower shadow ${inr(sC.lower)} is ${times(sC.lower, sC.body)} the ${inr(sC.body)} body (rule: at least 2×).`,
            `Upper shadow ${inr(sC.upper)} is small (rule: at most 10% of range or half the body).`,
            `Body is ${pctOf(sC.body, sC.range)} of the range (rule: more than 10%, otherwise it is treated as a doji).`,
            trend === 'decline' ? 'Formed after a prior decline (required for a hammer).' : 'Formed after a prior advance (the same shape is called a hanging man there).',
          ],
        });
      }
      if (sC.body > 0.1 * sC.range && sC.upper >= 2 * sC.body && smallLower && trend !== 'none') {
        detections.push({
          name: trend === 'advance' ? 'Shooting star' : 'Inverted hammer',
          direction: trend === 'advance' ? 'bearish' : 'bullish',
          first: e,
          last: e,
          criteria: [
            `Upper shadow ${inr(sC.upper)} is ${times(sC.upper, sC.body)} the ${inr(sC.body)} body (rule: at least 2×).`,
            `Lower shadow ${inr(sC.lower)} is small (rule: at most 10% of range or half the body).`,
            trend === 'advance' ? 'Formed after a prior advance (required for a shooting star).' : 'Formed after a prior decline (the same shape is called an inverted hammer there).',
          ],
        });
      }
    }

    // --- Two-bar formations -------------------------------------------------
    const p = bars[e - 1];
    const sP = shape(p);
    const trend2 = priorTrend(e - 1);
    const ab2 = avgBody(e - 1);
    if (trend2 === 'decline' && sP.bear && sC.bull && c.open <= p.close && c.close >= p.open && sC.body > sP.body) {
      detections.push({
        name: 'Bullish engulfing', direction: 'bullish', first: e - 1, last: e,
        criteria: [
          `A rising bar (${inr(c.open)} → ${inr(c.close)}) whose body covers the prior falling body (${inr(p.open)} → ${inr(p.close)}).`,
          `Second body is ${times(sC.body, sP.body)} the first (rule: larger).`,
          'Formed after a prior decline.',
        ],
      });
    }
    if (trend2 === 'advance' && sP.bull && sC.bear && c.open >= p.close && c.close <= p.open && sC.body > sP.body) {
      detections.push({
        name: 'Bearish engulfing', direction: 'bearish', first: e - 1, last: e,
        criteria: [
          `A falling bar (${inr(c.open)} → ${inr(c.close)}) whose body covers the prior rising body (${inr(p.open)} → ${inr(p.close)}).`,
          `Second body is ${times(sC.body, sP.body)} the first (rule: larger).`,
          'Formed after a prior advance.',
        ],
      });
    }
    if (trend2 === 'decline' && sP.bear && sP.body >= ab2 && sC.bull && c.open < p.close && c.close > sP.mid && c.close < p.open) {
      detections.push({
        name: 'Piercing line', direction: 'bullish', first: e - 1, last: e,
        criteria: [
          `First bar falls with a long body (${inr(sP.body)}, at least the 10-bar average of ${inr(ab2)}).`,
          `Second bar opens below the first close (${inr(c.open)} < ${inr(p.close)}) and closes above the first body's midpoint (${inr(c.close)} > ${inr(sP.mid)}) without engulfing it.`,
          'Formed after a prior decline.',
        ],
      });
    }
    if (trend2 === 'advance' && sP.bull && sP.body >= ab2 && sC.bear && c.open > p.close && c.close < sP.mid && c.close > p.open) {
      detections.push({
        name: 'Dark cloud cover', direction: 'bearish', first: e - 1, last: e,
        criteria: [
          `First bar rises with a long body (${inr(sP.body)}, at least the 10-bar average of ${inr(ab2)}).`,
          `Second bar opens above the first close (${inr(c.open)} > ${inr(p.close)}) and closes below the first body's midpoint (${inr(c.close)} < ${inr(sP.mid)}) without engulfing it.`,
          'Formed after a prior advance.',
        ],
      });
    }
    const inside = sC.top <= sP.top && sC.bottom >= sP.bottom && sC.body <= 0.5 * sP.body;
    if (trend2 === 'decline' && sP.bear && sP.body >= ab2 && inside) {
      detections.push({
        name: 'Bullish harami', direction: 'bullish', first: e - 1, last: e,
        criteria: [
          `A long falling body (${inr(sP.body)}) followed by a body inside it no more than half its size (${inr(sC.body)}).`,
          'Formed after a prior decline.',
        ],
      });
    }
    if (trend2 === 'advance' && sP.bull && sP.body >= ab2 && inside) {
      detections.push({
        name: 'Bearish harami', direction: 'bearish', first: e - 1, last: e,
        criteria: [
          `A long rising body (${inr(sP.body)}) followed by a body inside it no more than half its size (${inr(sC.body)}).`,
          'Formed after a prior advance.',
        ],
      });
    }

    // --- Three-bar formations -----------------------------------------------
    const a = bars[e - 2];
    const sA = shape(a);
    const b = p;
    const sB = sP;
    const trend3 = priorTrend(e - 2);
    const ab3 = avgBody(e - 2);
    if (
      trend3 === 'decline' && sA.bear && sA.body >= ab3 && sB.body <= 0.5 * sA.body &&
      sB.top <= a.close + 0.25 * sA.body && sC.bull && c.close > sA.mid && sC.body >= 0.5 * sA.body
    ) {
      detections.push({
        name: 'Morning star', direction: 'bullish', first: e - 2, last: e,
        criteria: [
          `Long falling first body (${inr(sA.body)}), then a small middle body (${inr(sB.body)}, at most half the first) near or below the first close.`,
          `Third bar rises and closes above the first body's midpoint (${inr(c.close)} > ${inr(sA.mid)}).`,
          'Formed after a prior decline.',
        ],
      });
    }
    if (
      trend3 === 'advance' && sA.bull && sA.body >= ab3 && sB.body <= 0.5 * sA.body &&
      sB.bottom >= a.close - 0.25 * sA.body && sC.bear && c.close < sA.mid && sC.body >= 0.5 * sA.body
    ) {
      detections.push({
        name: 'Evening star', direction: 'bearish', first: e - 2, last: e,
        criteria: [
          `Long rising first body (${inr(sA.body)}), then a small middle body (${inr(sB.body)}, at most half the first) near or above the first close.`,
          `Third bar falls and closes below the first body's midpoint (${inr(c.close)} < ${inr(sA.mid)}).`,
          'Formed after a prior advance.',
        ],
      });
    }
    const soldiers = [a, b, c];
    const shapes = [sA, sB, sC];
    if (
      trend3 !== 'advance' &&
      shapes.every((s) => s.bull && s.body >= 0.8 * ab3 && s.upper <= 0.3 * s.body) &&
      b.close > a.close && c.close > b.close &&
      b.open >= sA.bottom && b.open <= sA.top && c.open >= sB.bottom && c.open <= sB.top
    ) {
      detections.push({
        name: 'Three white soldiers', direction: 'bullish', first: e - 2, last: e,
        criteria: [
          `Three rising bars, each with a body of at least 0.8× the 10-bar average (${inr(ab3)}) and a small upper shadow.`,
          `Each closes higher (${soldiers.map((x) => inr(x.close)).join(' → ')}) and opens within the previous body.`,
          trend3 === 'decline' ? 'Formed after a prior decline.' : 'Formed without a clear prior trend.',
        ],
      });
    }
    if (
      trend3 !== 'decline' &&
      shapes.every((s) => s.bear && s.body >= 0.8 * ab3 && s.lower <= 0.3 * s.body) &&
      b.close < a.close && c.close < b.close &&
      b.open >= sA.bottom && b.open <= sA.top && c.open >= sB.bottom && c.open <= sB.top
    ) {
      detections.push({
        name: 'Three black crows', direction: 'bearish', first: e - 2, last: e,
        criteria: [
          `Three falling bars, each with a body of at least 0.8× the 10-bar average (${inr(ab3)}) and a small lower shadow.`,
          `Each closes lower (${soldiers.map((x) => inr(x.close)).join(' → ')}) and opens within the previous body.`,
          trend3 === 'advance' ? 'Formed after a prior advance.' : 'Formed without a clear prior trend.',
        ],
      });
    }
  }

  const patterns = detections
    .map((d) => buildPattern(bars, d, timeframe, lastIdx, lastComplete, options.lastBarComplete, priorTrend(d.first)))
    .sort((x, y) => (x.detectedOn < y.detectedOn ? 1 : x.detectedOn > y.detectedOn ? -1 : 0))
    .slice(0, timeframe === 'daily' ? 6 : 4);

  return { ...base, patterns };
}

function buildPattern(
  bars: Bar[],
  d: Detection,
  timeframe: PatternTimeframe,
  lastIdx: number,
  lastComplete: number,
  lastBarComplete: boolean | null,
  trend: PriorTrend,
): CandlePattern {
  const slice = bars.slice(d.first, d.last + 1);
  const high = Math.max(...slice.map((b) => b.high));
  const low = Math.min(...slice.map((b) => b.low));
  const unit = timeframe === 'daily' ? 'daily' : 'weekly';
  const endsOnLatest = d.last === lastIdx;
  const complete = endsOnLatest ? lastBarComplete : true;

  // Volume of the final bar against the 20 bars before the formation.
  const prior = bars.slice(Math.max(0, d.first - 20), d.first);
  const avgVol = prior.length ? prior.reduce((s, b) => s + b.volume, 0) / prior.length : 0;
  const lastVol = bars[d.last].volume;
  const volumeContext =
    avgVol <= 0 || lastVol <= 0
      ? 'Volume is unavailable for these bars.'
      : `Final-bar volume is ${(lastVol / avgVol).toFixed(2)}× the average of the 20 ${unit} bars before the formation${
          lastVol / avgVol >= 1.2 ? ' (above average).' : lastVol / avgVol <= 0.8 ? ' (below average).' : ' (about average).'
        }${complete === true ? '' : ' The final bar is not known to be complete, so its volume may be partial.'}`;
  const trendContext =
    trend === 'decline'
      ? `Prior decline: the close before the formation was below both the close 10 ${unit} bars earlier and its 20-bar average.`
      : trend === 'advance'
        ? `Prior advance: the close before the formation was above both the close 10 ${unit} bars earlier and its 20-bar average.`
        : `No clear prior trend under the 10-bar and 20-bar-average rule.`;

  const confirmationRule =
    d.direction === 'bullish'
      ? `Confirmed if one of the next ${CONFIRM_BARS} completed ${unit} bars closes above the formation high (${inr(high)}).`
      : d.direction === 'bearish'
        ? `Confirmed if one of the next ${CONFIRM_BARS} completed ${unit} bars closes below the formation low (${inr(low)}).`
        : `Resolved upward or downward if one of the next ${CONFIRM_BARS} completed ${unit} bars closes above ${inr(high)} or below ${inr(low)}.`;
  const invalidationRule =
    d.direction === 'bullish'
      ? `Invalidated if a completed bar closes below the formation low (${inr(low)}) before confirmation.`
      : d.direction === 'bearish'
        ? `Invalidated if a completed bar closes above the formation high (${inr(high)}) before confirmation.`
        : 'A doji has no directional thesis to invalidate; it is recorded as indecision.';

  let status: PatternStatus;
  let statusDate: string | null = null;
  let statusNote: string;
  if (d.last > lastComplete) {
    status = 'forming';
    statusNote =
      lastBarComplete === null
        ? 'The final bar may still be in progress (completion could not be determined), so the formation is provisional and cannot yet be confirmed.'
        : 'The final bar is still in progress, so the formation is provisional and can change before the bar closes.';
  } else {
    let decided: { status: PatternStatus; date: string } | null = null;
    for (let k = 1; k <= CONFIRM_BARS && !decided; k++) {
      const j = d.last + k;
      if (j > lastComplete) break;
      const close = bars[j].close;
      if (d.direction === 'bullish') {
        if (close > high) decided = { status: 'confirmed', date: bars[j].date };
        else if (close < low) decided = { status: 'invalidated', date: bars[j].date };
      } else if (d.direction === 'bearish') {
        if (close < low) decided = { status: 'confirmed', date: bars[j].date };
        else if (close > high) decided = { status: 'invalidated', date: bars[j].date };
      } else if (close > high) decided = { status: 'resolved-up', date: bars[j].date };
      else if (close < low) decided = { status: 'resolved-down', date: bars[j].date };
    }
    const elapsed = Math.min(CONFIRM_BARS, lastComplete - d.last);
    if (decided) {
      status = decided.status;
      statusDate = decided.date;
      statusNote =
        status === 'confirmed'
          ? `Met its confirmation rule on the ${unit} bar of ${decided.date}. Confirmation describes what happened next; it does not establish a forecast.`
          : status === 'invalidated'
            ? `Invalidated on the ${unit} bar of ${decided.date}.`
            : `Indecision resolved ${status === 'resolved-up' ? 'upward' : 'downward'} on the ${unit} bar of ${decided.date}.`;
    } else if (elapsed >= CONFIRM_BARS) {
      status = d.direction === 'neutral' ? 'unresolved' : 'expired';
      statusNote =
        d.direction === 'neutral'
          ? `No close beyond the doji's range within ${CONFIRM_BARS} completed ${unit} bars.`
          : `Neither confirmed nor invalidated within ${CONFIRM_BARS} completed ${unit} bars; the formation has expired under this rule.`;
    } else {
      status = 'awaiting';
      statusNote = `${elapsed} of ${CONFIRM_BARS} completed ${unit} bars have elapsed without confirmation or invalidation.`;
    }
  }

  return {
    id: `${timeframe}:${d.name}:${bars[d.last].date}`,
    name: d.name,
    direction: d.direction,
    timeframe,
    dates: slice.map((b) => b.date),
    complete,
    criteria: d.criteria,
    bars: slice,
    trendContext,
    volumeContext,
    detectedOn: bars[d.last].date,
    confirmationRule,
    invalidationRule,
    status,
    statusDate,
    statusNote,
  };
}
