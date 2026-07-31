/**
 * Alert evaluation. The scheduler calls `scanAlerts()` on an interval; it
 * analyses each watched symbol once, tests every active rule against the fresh
 * analysis, and fires a push (plus a logged event) when a rule trips.
 *
 * A per-alert cooldown stops the same condition from notifying every cycle — an
 * alert that has fired stays quiet for `COOLDOWN_MS` unless it resets and trips
 * again.
 */

import { analyzeSwing } from './swing';
import { analyzeMidTerm } from './midterm';
import { fetchBars } from './providers';
import {
  getActiveAlerts,
  logEvent,
  markAlertFired,
  type AlertRow,
} from './db';
import { sendToUser } from './push';

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h — one nudge per condition per session-ish.

export interface ScanSummary {
  symbolsScanned: number;
  alertsChecked: number;
  fired: number;
  at: string;
}

export async function scanAlerts(): Promise<ScanSummary> {
  const alerts = getActiveAlerts();
  const now = Date.now();

  // Group by symbol so each series is fetched and analysed once, however many
  // users watch it.
  const bySymbol = new Map<string, AlertRow[]>();
  for (const a of alerts) {
    if (a.last_fired && now - a.last_fired < COOLDOWN_MS) continue; // cooling down
    const list = bySymbol.get(a.symbol) ?? [];
    list.push(a);
    bySymbol.set(a.symbol, list);
  }

  let fired = 0;
  for (const [symbol, rules] of bySymbol) {
    let evalCtx: EvalContext | null = null;
    try {
      evalCtx = await analyseFor(symbol);
    } catch {
      continue; // a bad symbol shouldn't stop the sweep
    }
    if (!evalCtx) continue;

    for (const rule of rules) {
      const hit = evaluate(rule, evalCtx);
      if (!hit) continue;

      markAlertFired(rule.id, now);
      logEvent({
        userId: rule.user_id,
        alertId: rule.id,
        symbol: rule.symbol,
        title: hit.title,
        body: hit.body,
      });
      await sendToUser(rule.user_id, {
        title: hit.title,
        body: hit.body,
        symbol: rule.symbol,
        url: `/?symbol=${encodeURIComponent(rule.symbol)}`,
      });
      fired++;
    }
  }

  return {
    symbolsScanned: bySymbol.size,
    alertsChecked: alerts.length,
    fired,
    at: new Date().toISOString(),
  };
}

interface EvalContext {
  price: number;
  shortScore: number;
  shortVerdict: string;
  midScore: number;
  changePct: number;
  brokeOut: boolean;
  brokeStop: boolean;
  stop: number | null;
  high20: number;
}

async function analyseFor(symbol: string): Promise<EvalContext | null> {
  const { bars } = await fetchBars(symbol, 2);
  if (bars.length < 60) return null;

  const short = analyzeSwing(bars);
  const mid = analyzeMidTerm(bars);
  const last = bars.at(-1)!;
  const prev = bars.at(-2)?.close ?? last.close;

  // 20-day high excluding today — the breakout reference.
  const win = bars.slice(-21, -1);
  const high20 = Math.max(...win.map((b) => b.high));

  return {
    price: last.close,
    shortScore: short.score,
    shortVerdict: short.verdict,
    midScore: mid.score,
    changePct: prev ? ((last.close - prev) / prev) * 100 : 0,
    brokeOut: last.close > high20,
    brokeStop: short.plan ? last.close < short.plan.stopLoss : false,
    stop: short.plan?.stopLoss ?? null,
    high20,
  };
}

function evaluate(rule: AlertRow, c: EvalContext): { title: string; body: string } | null {
  const inr = (n: number) => `₹${n.toFixed(2)}`;
  const score = rule.timeframe === 'mid' ? c.midScore : c.shortScore;

  switch (rule.kind) {
    case 'score_above':
      if (rule.threshold !== null && score >= rule.threshold)
        return {
          title: `${rule.name}: score ${Math.round(score)}`,
          body: `${rule.timeframe} score crossed above ${rule.threshold} (now ${Math.round(score)}, ${c.shortVerdict}). ${inr(c.price)}.`,
        };
      return null;

    case 'score_below':
      if (rule.threshold !== null && score <= rule.threshold)
        return {
          title: `${rule.name}: score ${Math.round(score)}`,
          body: `${rule.timeframe} score fell below ${rule.threshold} (now ${Math.round(score)}). ${inr(c.price)}.`,
        };
      return null;

    case 'breakout':
      if (c.brokeOut)
        return {
          title: `${rule.name}: breakout`,
          body: `Closed above its 20-day high (${inr(c.high20)}). Now ${inr(c.price)}.`,
        };
      return null;

    case 'hits_stop':
      if (c.brokeStop && c.stop !== null)
        return {
          title: `${rule.name}: broke stop`,
          body: `Closed below the swing stop (${inr(c.stop)}). Now ${inr(c.price)}. Reassess the position.`,
        };
      return null;

    case 'move_pct':
      if (rule.threshold !== null && Math.abs(c.changePct) >= rule.threshold)
        return {
          title: `${rule.name}: ${c.changePct >= 0 ? '+' : ''}${c.changePct.toFixed(1)}%`,
          body: `Moved ${c.changePct.toFixed(1)}% on the day (≥ ${rule.threshold}% trigger). Now ${inr(c.price)}.`,
        };
      return null;

    default:
      return null;
  }
}
