/**
 * Indicator states and transitions with explicit, reproducible rules. Pure.
 *
 * A STATE is a level on the latest bar ("RSI is 72"). A TRANSITION is a dated
 * change ("RSI crossed above 50 on 14 Nov"). The two are kept apart because a
 * high reading is not a crossover, and neither is a forecast. Related readings
 * (RSI, MACD, DI) are not independent votes; they are derived from the same
 * prices and are listed as context, not counted.
 *
 * No look-ahead: transitions, breakouts and divergences are searched only on
 * COMPLETED bars, and a swing pivot is only recognised once the bars that
 * define it have closed. An in-progress bar can appear in a state, labelled as
 * such, but it never confirms an event.
 */

import { adx, bollinger, macd, rsi, type Bar, type Series } from './indicators';
import { inr } from './format';

export interface CrossEvent {
  direction: 'up' | 'down';
  index: number;
  date: string;
  status: 'confirmed' | 'awaiting';
  /** Date the hold requirement was met, when confirmed. */
  statusDate: string | null;
  /** Completed bars on the new side, including the crossing bar. */
  heldBars: number;
}

/**
 * The most recent sign change of `a − b` between `from` and `lastComplete`.
 * Because it is the most recent change, every later bar is still on the new
 * side, so the cross is either confirmed (held `hold` bars) or still awaiting.
 */
export function latestCross(
  a: Series,
  b: Series | number,
  dates: string[],
  lastComplete: number,
  hold: number,
  from = 1,
): CrossEvent | null {
  const diff = (i: number): number | null => {
    const x = a[i];
    const y = typeof b === 'number' ? b : b[i];
    if (x === null || x === undefined || y === null || y === undefined) return null;
    return x - y;
  };
  for (let i = lastComplete; i >= Math.max(1, from); i--) {
    const before = diff(i - 1);
    const now = diff(i);
    if (before === null || now === null || before === 0 || now === 0) continue;
    if (Math.sign(before) === Math.sign(now)) continue;
    const heldBars = lastComplete - i + 1;
    const confirmed = heldBars >= hold;
    return {
      direction: now > 0 ? 'up' : 'down',
      index: i,
      date: dates[i],
      status: confirmed ? 'confirmed' : 'awaiting',
      statusDate: confirmed ? dates[i + hold - 1] : null,
      heldBars,
    };
  }
  return null;
}

export type IndicatorEventKind = 'state' | 'transition' | 'breakout' | 'divergence';
export type IndicatorEventStatus = 'current' | 'awaiting' | 'confirmed' | 'failed' | 'active' | 'invalidated';

export interface IndicatorEvent {
  id: string;
  name: string;
  kind: IndicatorEventKind;
  direction: 'bullish' | 'bearish' | 'neutral';
  timeframe: 'daily' | 'weekly';
  /** Bar date of the event; for a state, the bar the level was read from. */
  date: string | null;
  status: IndicatorEventStatus;
  statusDate: string | null;
  reading: string;
  rule: string;
  interpretation: string;
  lookback: string;
}

export interface IndicatorScan {
  events: IndicatorEvent[];
  notes: string[];
}

const one = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(1));
const PIVOT_SIDE = 5;

function pivots(bars: Bar[], upto: number, kind: 'high' | 'low'): number[] {
  const out: number[] = [];
  for (let i = PIVOT_SIDE; i <= upto - PIVOT_SIDE; i++) {
    let ok = true;
    for (let j = i - PIVOT_SIDE; j <= i + PIVOT_SIDE && ok; j++) {
      if (j === i) continue;
      if (kind === 'high' ? bars[j].high >= bars[i].high : bars[j].low <= bars[i].low) ok = false;
    }
    if (ok) out.push(i);
  }
  return out;
}

export function scanIndicatorEvents(
  daily: Bar[],
  weekly: { bars: Bar[]; lastComplete: boolean | null },
  lastBarComplete: boolean | null,
): IndicatorScan {
  const events: IndicatorEvent[] = [];
  const notes: string[] = [];
  const n = daily.length;
  if (n < 60) return { events, notes: [`Only ${n} daily bars are available; indicator events need at least 60.`] };

  const lastIdx = n - 1;
  const lastComplete = lastBarComplete === true ? lastIdx : lastIdx - 1;
  const recentFrom = Math.max(1, lastComplete - 19);
  const dates = daily.map((b) => b.date);
  const closes = daily.map((b) => b.close);
  const rsiS = rsi(closes, 14);
  const ad = adx(daily, 14);
  const bb = bollinger(closes, 20);
  const partial = lastBarComplete === true ? '' : lastBarComplete === false ? ' (latest bar in progress)' : ' (latest bar may be in progress)';

  if (lastBarComplete !== true) {
    notes.push('The latest daily bar is not known to be complete. It is used for current levels (labelled), but transitions, breakouts and divergences are searched only on completed bars.');
  }

  // --- Transitions ----------------------------------------------------------
  const rsiCross = latestCross(rsiS, 50, dates, lastComplete, 3, recentFrom);
  if (rsiCross) {
    events.push({
      id: `rsi50:${rsiCross.date}`,
      name: `RSI(14) crossed ${rsiCross.direction === 'up' ? 'above' : 'below'} 50`,
      kind: 'transition',
      direction: rsiCross.direction === 'up' ? 'bullish' : 'bearish',
      timeframe: 'daily',
      date: rsiCross.date,
      status: rsiCross.status,
      statusDate: rsiCross.statusDate,
      reading: `RSI ${one(rsiS[rsiCross.index - 1])} → ${one(rsiS[rsiCross.index])} on ${rsiCross.date}; ${rsiCross.heldBars} completed session${rsiCross.heldBars === 1 ? '' : 's'} on the new side.`,
      rule: 'The first completed session where RSI(14) moves from one side of 50 to the other. Confirmed after 3 consecutive completed sessions on the new side.',
      interpretation: 'A shift in the balance of recent gains and losses. It is a transition, distinct from RSI simply being high or low, and it is not a forecast.',
      lookback: 'Last 20 completed daily sessions',
    });
  }

  const diCross = latestCross(ad.plusDI, ad.minusDI, dates, lastComplete, 3, recentFrom);
  if (diCross) {
    const adxAt = ad.adx[diCross.index];
    events.push({
      id: `di:${diCross.date}`,
      name: `${diCross.direction === 'up' ? '+DI crossed above −DI' : '−DI crossed above +DI'}`,
      kind: 'transition',
      direction: diCross.direction === 'up' ? 'bullish' : 'bearish',
      timeframe: 'daily',
      date: diCross.date,
      status: diCross.status,
      statusDate: diCross.statusDate,
      reading: `+DI ${one(ad.plusDI[diCross.index])} vs −DI ${one(ad.minusDI[diCross.index])} on ${diCross.date}; ADX ${one(adxAt)} that day.`,
      rule: 'The first completed session where +DI(14) and −DI(14) change order. Confirmed after 3 consecutive completed sessions in the new order.',
      interpretation:
        adxAt !== null && adxAt < 20
          ? 'The directional lines changed order while ADX was below 20; such crosses occur often in sideways markets.'
          : 'The directional lines changed order: recent range expansion favoured the other side.',
      lookback: 'Last 20 completed daily sessions',
    });
  }

  // Breakouts beyond prior highs/lows. The breakout bar itself is excluded
  // from the level it is compared with.
  const highs = daily.map((b) => b.high);
  const lows = daily.map((b) => b.low);
  const vols = daily.map((b) => b.volume);
  const priorMax = (i: number, len: number) => Math.max(...highs.slice(i - len, i));
  const priorMin = (i: number, len: number) => Math.min(...lows.slice(i - len, i));
  let breakout: { i: number; len: number; level: number; up: boolean } | null = null;
  let upCount = 0;
  let downCount = 0;
  for (let i = lastComplete; i >= recentFrom; i--) {
    if (i < 63) break;
    const longOk = i >= 252;
    const upLevel = longOk && closes[i] > priorMax(i, 252) ? { len: 252, level: priorMax(i, 252) } : closes[i] > priorMax(i, 63) ? { len: 63, level: priorMax(i, 63) } : null;
    const downLevel = longOk && closes[i] < priorMin(i, 252) ? { len: 252, level: priorMin(i, 252) } : closes[i] < priorMin(i, 63) ? { len: 63, level: priorMin(i, 63) } : null;
    if (upLevel) upCount++;
    if (downLevel) downCount++;
    if (!breakout && upLevel) breakout = { i, ...upLevel, up: true };
    else if (!breakout && downLevel) breakout = { i, ...downLevel, up: false };
  }
  if (breakout) {
    const { i, len, level, up } = breakout;
    const priorVol = vols.slice(Math.max(0, i - 50), i);
    const avgVol = priorVol.length ? priorVol.reduce((s, v) => s + v, 0) / priorVol.length : 0;
    const volRatio = avgVol > 0 && vols[i] > 0 ? vols[i] / avgVol : null;
    let status: IndicatorEventStatus = 'awaiting';
    let statusDate: string | null = null;
    let held = 0;
    for (let k = 1; k <= 3; k++) {
      const j = i + k;
      if (j > lastComplete) break;
      if (up ? closes[j] < level : closes[j] > level) { status = 'failed'; statusDate = dates[j]; break; }
      held++;
      if (held === 3) { status = 'confirmed'; statusDate = dates[j]; }
    }
    const span = len === 252 ? '252-session (about 52-week)' : '63-session (about 3-month)';
    const count = up ? upCount : downCount;
    events.push({
      id: `breakout:${up ? 'up' : 'down'}:${dates[i]}`,
      name: `${up ? 'Close above' : 'Close below'} the prior ${span} ${up ? 'high' : 'low'}`,
      kind: 'breakout',
      direction: up ? 'bullish' : 'bearish',
      timeframe: 'daily',
      date: dates[i],
      status,
      statusDate,
      reading: `Close ${inr(closes[i])} vs prior ${up ? 'high' : 'low'} ${inr(level)} on ${dates[i]}${
        volRatio !== null ? `; volume ${volRatio.toFixed(2)}× its prior 50-session average${volRatio >= 1.5 ? ' (meets the 1.5× volume rule)' : ' (below the 1.5× volume rule)'}` : '; volume unavailable'
      }. ${count} such close${count === 1 ? '' : 's'} in the last 20 completed sessions.`,
      rule: `Close beyond the ${up ? 'highest high' : 'lowest low'} of the preceding ${len} sessions (the breakout bar is excluded). Volume-confirmed when that day's volume is at least 1.5× the prior 50-session average. Follow-through is confirmed when the next 3 completed closes stay beyond the level and fails if any of them closes back inside.`,
      interpretation: up
        ? 'Price exceeded its recent range. A breakout can reverse, so follow-through status is shown separately from the breakout itself.'
        : 'Price fell below its recent range. A breakdown does not establish how far a decline will go.',
      lookback: 'Most recent occurrence in the last 20 completed daily sessions',
    });
  }

  // Weekly MACD cross, completed weeks only.
  const wb = weekly.bars;
  const wComplete = weekly.lastComplete === true ? wb.length - 1 : wb.length - 2;
  if (wb.length >= 40 && wComplete >= 36) {
    const wm = macd(wb.map((b) => b.close));
    const wDates = wb.map((b) => b.date);
    const wc = latestCross(wm.macd, wm.signal, wDates, wComplete, 2, Math.max(1, wComplete - 7));
    if (wc) {
      events.push({
        id: `wmacd:${wc.date}`,
        name: `Weekly MACD crossed ${wc.direction === 'up' ? 'above' : 'below'} its signal line`,
        kind: 'transition',
        direction: wc.direction === 'up' ? 'bullish' : 'bearish',
        timeframe: 'weekly',
        date: wc.date,
        status: wc.status,
        statusDate: wc.statusDate,
        reading: `Week beginning ${wc.date}: MACD ${one(wm.macd[wc.index])} vs signal ${one(wm.signal[wc.index])}.`,
        rule: 'MACD (12, 26, 9) on weekly closes. The first completed week where the MACD line moves to the other side of its signal line; confirmed if it holds for 2 completed weeks. The current week is excluded until it completes.',
        interpretation: 'A change in weekly momentum. MACD is derived from the same closes as the moving averages, so it is not independent evidence.',
        lookback: 'Last 8 completed weeks',
      });
    }
  } else {
    notes.push('Too few completed weekly bars for a weekly MACD transition.');
  }

  // RSI divergence on confirmed swing pivots.
  const recentDivergence = (kind: 'high' | 'low') => {
    const piv = pivots(daily, lastComplete, kind).filter((i) => i >= lastComplete - 90);
    if (piv.length < 2) return;
    const p2 = piv[piv.length - 1];
    const confirmIdx = p2 + PIVOT_SIDE;
    if (confirmIdx < lastComplete - 19) return;
    let p1 = -1;
    for (let k = piv.length - 2; k >= 0; k--) {
      const gap = p2 - piv[k];
      if (gap < 10) continue;
      if (gap <= 60) p1 = piv[k];
      break;
    }
    if (p1 < 0) return;
    const r1 = rsiS[p1];
    const r2 = rsiS[p2];
    if (r1 === null || r2 === null) return;
    const bearish = kind === 'high';
    const priceDiverges = bearish ? daily[p2].high > daily[p1].high : daily[p2].low < daily[p1].low;
    const rsiDiverges = bearish ? r2 <= r1 - 2 : r2 >= r1 + 2;
    if (!priceDiverges || !rsiDiverges) return;
    const pivotLevel = bearish ? daily[p2].high : daily[p2].low;
    let invalidDate: string | null = null;
    for (let j = confirmIdx + 1; j <= lastComplete; j++) {
      if (bearish ? closes[j] > pivotLevel : closes[j] < pivotLevel) { invalidDate = dates[j]; break; }
    }
    events.push({
      id: `div:${kind}:${dates[p2]}`,
      name: bearish ? 'Bearish RSI divergence' : 'Bullish RSI divergence',
      kind: 'divergence',
      direction: bearish ? 'bearish' : 'bullish',
      timeframe: 'daily',
      date: dates[confirmIdx],
      status: invalidDate ? 'invalidated' : 'active',
      statusDate: invalidDate,
      reading: `Pivot ${bearish ? 'highs' : 'lows'} ${inr(bearish ? daily[p1].high : daily[p1].low)} (${dates[p1]}) → ${inr(pivotLevel)} (${dates[p2]}); RSI ${one(r1)} → ${one(r2)}. Recognised on ${dates[confirmIdx]}, when the second pivot was confirmed.`,
      rule: `A pivot ${bearish ? 'high' : 'low'} is a bar whose ${bearish ? 'high is above' : 'low is below'} the 5 bars on each side, so it is only known 5 bars later. Divergence: the latest pivot makes a ${bearish ? 'higher high' : 'lower low'} than the previous pivot 10–60 sessions earlier while RSI(14) is at least 2 points ${bearish ? 'lower' : 'higher'}. Invalidated if a later close goes ${bearish ? 'above' : 'below'} the latest pivot.`,
      interpretation: bearish
        ? 'RSI did not confirm the higher price high. This describes weakening momentum; many divergences resolve without a reversal.'
        : 'RSI did not confirm the lower price low. This describes easing downside momentum; many divergences resolve without a reversal.',
      lookback: 'Pivots within the last 90 completed sessions; reported if recognised in the last 20',
    });
  };
  recentDivergence('high');
  recentDivergence('low');

  // --- Current states (levels, not signals) -----------------------------------
  const r = rsiS[lastIdx];
  if (r !== null) {
    events.push({
      id: 'state:rsi',
      name: 'RSI(14) level',
      kind: 'state',
      direction: 'neutral',
      timeframe: 'daily',
      date: dates[lastIdx],
      status: 'current',
      statusDate: null,
      reading: `RSI(14) ${r.toFixed(1)}${partial}.`,
      rule: 'Wilder RSI over 14 daily closes. Bands used here: 70 or above, 30 or below, otherwise between.',
      interpretation:
        r >= 70
          ? 'In the band conventionally called overbought. This is a level, not a crossover or a reversal signal.'
          : r <= 30
            ? 'In the band conventionally called oversold. A low reading does not imply a recovery.'
            : 'Between the conventional 30 and 70 bands.',
      lookback: '14-session Wilder smoothing',
    });
  }

  const adxV = ad.adx[lastIdx];
  const plus = ad.plusDI[lastIdx];
  const minus = ad.minusDI[lastIdx];
  if (adxV !== null && plus !== null && minus !== null) {
    const band = adxV >= 25 ? 'Trending' : adxV < 20 ? 'Not trending' : 'Developing';
    events.push({
      id: 'state:adx',
      name: 'ADX trend-strength level',
      kind: 'state',
      direction: adxV >= 20 ? (plus > minus ? 'bullish' : 'bearish') : 'neutral',
      timeframe: 'daily',
      date: dates[lastIdx],
      status: 'current',
      statusDate: null,
      reading: `ADX ${adxV.toFixed(1)} · +DI ${plus.toFixed(1)} · −DI ${minus.toFixed(1)}${partial}.`,
      rule: 'Wilder ADX(14) measures trend strength, not direction; +DI and −DI show which side has led. Bands: 25 or above trending, below 20 not trending, otherwise developing.',
      interpretation: `${band}; ${plus > minus ? '+DI leads −DI' : '−DI leads +DI'}.`,
      lookback: '28+ sessions of Wilder smoothing',
    });
  }

  const bwHistory = bb.bandwidth.slice(Math.max(0, n - 252)).filter((v): v is number => v !== null);
  const bwNow = bb.bandwidth[lastIdx];
  if (bwNow !== null && bwHistory.length >= 60) {
    const pctile = bwHistory.filter((v) => v < bwNow).length / bwHistory.length;
    const state = pctile <= 0.2 ? 'Compressed' : pctile >= 0.8 ? 'Expanded' : 'Typical';
    events.push({
      id: 'state:bandwidth',
      name: 'Bollinger bandwidth level',
      kind: 'state',
      direction: 'neutral',
      timeframe: 'daily',
      date: dates[lastIdx],
      status: 'current',
      statusDate: null,
      reading: `Bandwidth ${(bwNow * 100).toFixed(1)}% of the 20-session average; ${Math.round(pctile * 100)}th percentile of the last ${bwHistory.length} sessions${partial}.`,
      rule: 'Bollinger bands use 20 sessions and 2 standard deviations. Bandwidth = (upper − lower) ÷ middle, ranked against the last 252 sessions: 20th percentile or lower is compressed, 80th or higher is expanded.',
      interpretation:
        state === 'Compressed'
          ? 'Volatility is compressed relative to the past year. Compression says nothing about the direction of any later move.'
          : state === 'Expanded'
            ? 'Volatility is wide relative to the past year.'
            : 'Volatility is within its usual range for the past year.',
      lookback: '20-session bands ranked over 252 sessions',
    });
  }

  if (wb.length >= 16) {
    const wr = rsi(wb.map((b) => b.close), 14);
    const wLast = wr[wb.length - 1];
    if (wLast !== null) {
      events.push({
        id: 'state:weekly-rsi',
        name: 'Weekly RSI(14) level',
        kind: 'state',
        direction: 'neutral',
        timeframe: 'weekly',
        date: wb[wb.length - 1].date,
        status: 'current',
        statusDate: null,
        reading: `Weekly RSI(14) ${wLast.toFixed(1)}${weekly.lastComplete === true ? '' : ' (current week to date)'}.`,
        rule: 'Wilder RSI over 14 weekly closes; the current week counts with its latest close until it completes.',
        interpretation:
          wLast >= 70 ? 'Weekly momentum is in the conventional overbought band.' : wLast <= 30 ? 'Weekly momentum is in the conventional oversold band.' : 'Weekly momentum is between the conventional bands.',
        lookback: '14 weekly closes with Wilder smoothing',
      });
    }
  }

  const dated = events.filter((e) => e.kind !== 'state').sort((x, y) => ((x.date ?? '') < (y.date ?? '') ? 1 : -1));
  const states = events.filter((e) => e.kind === 'state');
  return { events: [...dated, ...states], notes };
}
