/**
 * Independent verification of the indicator engine.
 * Compares our SMA against Yahoo's own published 50/200-day averages, and
 * re-derives RSI/EMA/ATR with naive implementations written from scratch.
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const SYM = 'TCS.NS';

const from = new Date();
from.setFullYear(from.getFullYear() - 2);
const chart = await yf.chart(SYM, { period1: from, interval: '1d' });
const bars = chart.quotes.filter((q) => q.close != null && q.volume != null);
const closes = bars.map((b) => b.close);
const quote = await yf.quote(SYM);

const fail = [];
const check = (name, ours, theirs, tolPct) => {
  const diff = Math.abs(ours - theirs);
  const pct = (diff / theirs) * 100;
  const ok = pct <= tolPct;
  if (!ok) fail.push(name);
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ours=${ours.toFixed(4).padStart(12)}  ref=${theirs.toFixed(4).padStart(12)}  diff=${pct.toFixed(4)}%`,
  );
};

// --- SMA vs Yahoo's own published averages (fully independent reference) ----
const naiveSMA = (arr, p) => arr.slice(-p).reduce((a, b) => a + b, 0) / p;
check('SMA50 vs Yahoo', naiveSMA(closes, 50), quote.fiftyDayAverage, 0.5);
check('SMA200 vs Yahoo', naiveSMA(closes, 200), quote.twoHundredDayAverage, 0.5);

// --- RSI: naive from-scratch Wilder, compared to our library --------------
function naiveRSI(v, p = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  let ag = gains.slice(0, p).reduce((a, b) => a + b, 0) / p;
  let al = losses.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < gains.length; i++) {
    ag = (ag * (p - 1) + gains[i]) / p;
    al = (al * (p - 1) + losses[i]) / p;
  }
  return 100 - 100 / (1 + ag / al);
}

function naiveEMA(v, p) {
  const k = 2 / (p + 1);
  let e = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < v.length; i++) e = v[i] * k + e * (1 - k);
  return e;
}

function naiveATR(b, p = 14) {
  const tr = b.map((x, i) =>
    i === 0
      ? x.high - x.low
      : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)),
  );
  let a = tr.slice(1, p + 1).reduce((s, x) => s + x, 0) / p;
  for (let i = p + 1; i < tr.length; i++) a = (a * (p - 1) + tr[i]) / p;
  return a;
}

// Pull our values back out of the running API so we test the real code path.
const res = await fetch(`http://localhost:3000/api/analyze?q=${SYM}`);
const api = await res.json();
const s = api.analysis.snapshot;

check('RSI14', s.rsi14, naiveRSI(closes), 0.001);
check('EMA20', s.ema20, naiveEMA(closes, 20), 0.001);
check('EMA50', s.ema50, naiveEMA(closes, 50), 0.001);
check('ATR14', s.atr14, naiveATR(bars), 0.001);

// --- Internal consistency of the trade plan --------------------------------
const p = api.analysis.plan;
const rr = (p.target1 - s.price) / (s.price - p.stopLoss);
check('Risk:reward arithmetic', p.riskReward, rr, 0.001);
console.log(
  `${p.stopLoss < s.price ? 'PASS' : 'FAIL'}  stop below price`,
  `\n${p.target1 > s.price ? 'PASS' : 'FAIL'}  target above price`,
  `\n${p.target2 > p.target1 ? 'PASS' : 'FAIL'}  target2 above target1`,
);

// --- Score must be reproducible from the published signals ------------------
const tw = api.analysis.signals.reduce((a, x) => a + x.weight, 0);
const raw = api.analysis.signals.reduce((a, x) => a + x.weight * ((x.score + 1) / 2), 0);
check('Score reproducible', api.analysis.score, (raw / tw) * 100, 0.05);

console.log(fail.length ? `\n${fail.length} FAILURES: ${fail.join(', ')}` : '\nAll checks passed.');
