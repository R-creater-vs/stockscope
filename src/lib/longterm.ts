/**
 * Long-term / investing engine (holding period: months to years).
 *
 * This is the only engine driven by fundamentals rather than price alone. It
 * grades valuation, quality, growth and financial health, then checks that the
 * long-term price trend agrees. Yahoo's fundamentals coverage of Indian stocks
 * is patchy, so every input is nullable: a category with no data is dropped and
 * the score renormalises over what remains, with confidence lowered to match.
 */

import { sma, last } from './indicators';
import type { Bar } from './indicators';
import type { Fundamentals } from './yahoo';
import type { Signal } from './swing';
import {
  confidenceLabel,
  directionOf,
  gaugeConfidence,
  inr,
  scale,
  scoreSignals,
  toVerdict,
  type ActionPlan,
  type TimeframeAnalysis,
} from './timeframes';

/** Average the non-null sub-scores; null if a category has no data at all. */
function avg(...xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const fracPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function analyzeLongTerm(bars: Bar[], f: Fundamentals): TimeframeAnalysis {
  const closes = bars.map((b) => b.close);
  const price = closes.at(-1)!;
  const s200 = last(sma(closes, 200));
  const s200Ago = sma(closes, 200).at(-63) ?? null; // ~3 months ago

  const signals: Signal[] = [];
  let categoriesPossible = 0;
  let categoriesWithData = 0;

  // --- Valuation -------------------------------------------------------------
  categoriesPossible++;
  const valScore = avg(
    f.peRatio !== null && f.peRatio > 0 ? scale(f.peRatio, 45, 12) : null,
    f.pegRatio !== null && f.pegRatio > 0 ? scale(f.pegRatio, 2.5, 0.8) : null,
    f.priceToBook !== null && f.priceToBook > 0 ? scale(f.priceToBook, 7, 1) : null,
  );
  if (valScore !== null) {
    categoriesWithData++;
    signals.push({
      name: 'Valuation',
      category: 'Valuation',
      direction: directionOf(valScore),
      score: valScore,
      weight: 18,
      detail: valuationDetail(f),
    });
  }

  // --- Quality / profitability ----------------------------------------------
  categoriesPossible++;
  const qualScore = avg(
    f.returnOnEquity !== null ? scale(f.returnOnEquity, 0.05, 0.25) : null,
    f.operatingMargin !== null ? scale(f.operatingMargin, 0.05, 0.25) : null,
    f.profitMargin !== null ? scale(f.profitMargin, 0.03, 0.2) : null,
  );
  if (qualScore !== null) {
    categoriesWithData++;
    signals.push({
      name: 'Profitability',
      category: 'Quality',
      direction: directionOf(qualScore),
      score: qualScore,
      weight: 18,
      detail:
        `Return on equity ${f.returnOnEquity !== null ? fracPct(f.returnOnEquity) : '—'}, ` +
        `operating margin ${f.operatingMargin !== null ? fracPct(f.operatingMargin) : '—'}, ` +
        `net margin ${f.profitMargin !== null ? fracPct(f.profitMargin) : '—'}. ` +
        (qualScore > 0.25
          ? 'A genuinely profitable business.'
          : qualScore < -0.25
            ? 'Thin returns — capital is not working hard here.'
            : 'Middling profitability.'),
    });
  }

  // --- Growth ----------------------------------------------------------------
  categoriesPossible++;
  const growthScore = avg(
    f.revenueGrowth !== null ? scale(f.revenueGrowth, -0.05, 0.2) : null,
    f.earningsGrowth !== null ? scale(f.earningsGrowth, -0.1, 0.25) : null,
  );
  if (growthScore !== null) {
    categoriesWithData++;
    signals.push({
      name: 'Growth',
      category: 'Growth',
      direction: directionOf(growthScore),
      score: growthScore,
      weight: 16,
      detail:
        `Revenue growth ${f.revenueGrowth !== null ? fracPct(f.revenueGrowth) : '—'}, ` +
        `earnings growth ${f.earningsGrowth !== null ? fracPct(f.earningsGrowth) : '—'}. ` +
        (growthScore > 0.25
          ? 'The top and/or bottom line is expanding.'
          : growthScore < -0.25
            ? 'Shrinking — a headwind for a multi-year hold.'
            : 'Roughly flat growth.'),
    });
  }

  // --- Financial health ------------------------------------------------------
  categoriesPossible++;
  const healthScore = avg(
    // Yahoo reports debt/equity in percentage terms (e.g. 36 ≈ 0.36x).
    f.debtToEquity !== null ? scale(f.debtToEquity, 200, 20) : null,
    f.currentRatio !== null ? scale(f.currentRatio, 0.8, 2.5) : null,
  );
  if (healthScore !== null) {
    categoriesWithData++;
    signals.push({
      name: 'Balance-sheet health',
      category: 'Health',
      direction: directionOf(healthScore),
      score: healthScore,
      weight: 14,
      detail:
        `Debt/equity ${f.debtToEquity !== null ? f.debtToEquity.toFixed(0) + '%' : '—'}, ` +
        `current ratio ${f.currentRatio !== null ? f.currentRatio.toFixed(2) : '—'}. ` +
        (healthScore > 0.25
          ? 'A sturdy balance sheet.'
          : healthScore < -0.25
            ? 'Leverage or liquidity is a concern — a real risk through a downturn.'
            : 'An average balance sheet.'),
    });
  }

  // --- Long-term price trend -------------------------------------------------
  categoriesPossible++;
  if (s200 !== null) {
    categoriesWithData++;
    const above = price > s200;
    const rising = s200Ago !== null && s200 > s200Ago;
    const score = above && rising ? 1 : above ? 0.4 : rising ? -0.1 : -0.8;
    signals.push({
      name: 'Long-term price trend',
      category: 'Trend',
      direction: directionOf(score),
      score,
      weight: 20,
      detail: above
        ? `Price ${inr(price)} is above its 200-day average (${inr(s200)}), which is ${rising ? 'rising' : 'flat/falling'} — the market's long-term verdict is ${rising ? 'positive' : 'cautiously positive'}. Even a great business is a poor investment while its price trend is down; here it is up.`
        : `Price ${inr(price)} is below its 200-day average (${inr(s200)}). Whatever the fundamentals say, the market has been marking this business down — wait for the price trend to stabilise before committing.`,
    });
  }

  // --- Ownership -------------------------------------------------------------
  categoriesPossible++;
  const ownScore = avg(
    f.promoterHolding !== null
      ? f.promoterHolding > 0.75
        ? 0.2
        : scale(f.promoterHolding, 0.2, 0.6)
      : null,
    f.institutionalHolding !== null ? scale(f.institutionalHolding, 0.05, 0.4) : null,
  );
  if (ownScore !== null) {
    categoriesWithData++;
    signals.push({
      name: 'Ownership',
      category: 'Ownership',
      direction: directionOf(ownScore),
      score: ownScore,
      weight: 8,
      detail:
        `Promoter/insider holding ${f.promoterHolding !== null ? fracPct(f.promoterHolding) : '—'}, ` +
        `institutional ${f.institutionalHolding !== null ? fracPct(f.institutionalHolding) : '—'}. ` +
        (ownScore > 0.25
          ? 'Strong skin in the game.'
          : 'Ownership is not a standout either way.'),
    });
  }

  const score = signals.length ? scoreSignals(signals) : 50;
  const verdict = toVerdict(score);
  // Confidence clarity here is data completeness — a thesis built on two of six
  // categories deserves less trust than one built on all six.
  const clarity = categoriesPossible ? categoriesWithData / categoriesPossible : 0;
  const confidence = gaugeConfidence(signals, clarity);

  const riskFlags = buildRiskFlags(f, price, s200);
  const action = buildAction(price, s200, verdict);
  const summary = buildSummary(score, verdict, f, price, s200);

  const missing = categoriesPossible - categoriesWithData;
  const dataNote =
    missing > 0
      ? `${categoriesWithData} of ${categoriesPossible} fundamental categories had data — Yahoo's coverage of Indian fundamentals is patchy, so treat this read as directional.`
      : undefined;

  return {
    timeframe: 'long',
    label: 'Long-term',
    horizon: 'Months to years',
    approach: 'Fundamentals — valuation, quality, growth, health & trend',
    score,
    verdict,
    verdictLabel: LONG_VERDICT[verdict],
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    signals,
    bullPoints: signals.filter((x) => x.score > 0.25).map((x) => x.detail),
    bearPoints: signals.filter((x) => x.score < -0.25).map((x) => x.detail),
    riskFlags,
    summary,
    action,
    tradePlan: null,
    dataNote,
  };
}

const LONG_VERDICT: Record<string, string> = {
  STRONG_BUY: 'Strong buy — accumulate',
  BUY: 'Accumulate',
  HOLD: 'Hold',
  AVOID: 'Avoid',
};

function valuationDetail(f: Fundamentals): string {
  const bits: string[] = [];
  if (f.peRatio !== null) bits.push(`P/E ${f.peRatio.toFixed(1)}`);
  if (f.pegRatio !== null) bits.push(`PEG ${f.pegRatio.toFixed(2)}`);
  if (f.priceToBook !== null) bits.push(`P/B ${f.priceToBook.toFixed(2)}`);
  const val = avg(
    f.peRatio !== null && f.peRatio > 0 ? scale(f.peRatio, 45, 12) : null,
    f.pegRatio !== null && f.pegRatio > 0 ? scale(f.pegRatio, 2.5, 0.8) : null,
    f.priceToBook !== null && f.priceToBook > 0 ? scale(f.priceToBook, 7, 1) : null,
  );
  const verdict =
    val === null ? '' : val > 0.25 ? ' — undemanding.' : val < -0.25 ? ' — richly valued.' : ' — fairly valued.';
  return `${bits.join(', ') || 'Valuation data unavailable'}${verdict}`;
}

function buildAction(price: number, s200: number | null, verdict: string): ActionPlan {
  const accumulate = verdict === 'BUY' || verdict === 'STRONG_BUY';
  const zoneLow = s200 !== null && s200 < price ? s200 : price * 0.9;

  return {
    headline: accumulate
      ? `Accumulate in tranches from ${inr(price)} down toward ${inr(zoneLow)}.`
      : verdict === 'HOLD'
        ? 'Hold existing positions; no compelling reason to add at these levels.'
        : 'The fundamental and/or trend case is weak — avoid for a long-term hold.',
    entryLow: accumulate ? zoneLow : null,
    entryHigh: accumulate ? price : null,
    stopLoss: null, // investors exit on a broken thesis, not a price stop
    target1: null,
    target2: null,
    note: accumulate
      ? `Long-term positions are built in tranches, not a single buy — average in toward the 200-day average (${s200 !== null ? inr(s200) : '—'}) and add on weakness while the fundamentals hold. The thesis breaks if earnings growth turns negative or debt climbs, not on a bad week of price.`
      : 'For a long-term hold, revisit only if the fundamentals improve or the price trend turns back up — there is no tight stop here, because the decision is about the business, not the tape.',
  };
}

function buildRiskFlags(f: Fundamentals, price: number, s200: number | null): string[] {
  const flags: string[] = [];
  if (f.debtToEquity !== null && f.debtToEquity > 150)
    flags.push(`High leverage: debt/equity ${f.debtToEquity.toFixed(0)}%. Debt magnifies losses in a downturn.`);
  if (f.earningsGrowth !== null && f.earningsGrowth < 0)
    flags.push(`Earnings are shrinking (${fracPct(f.earningsGrowth)}) — a direct headwind for a multi-year hold.`);
  if (f.eps !== null && f.eps < 0)
    flags.push('The company is loss-making (negative EPS). Valuation multiples are meaningless until it turns a profit.');
  if (f.peRatio !== null && f.peRatio > 60)
    flags.push(`Very rich valuation (P/E ${f.peRatio.toFixed(0)}). Priced for perfection — little margin for disappointment.`);
  if (s200 !== null && price < s200)
    flags.push('Below the 200-day average — the market has been marking the business down. Good fundamentals do not pay while the trend is falling.');
  return flags;
}

function buildSummary(
  score: number,
  verdict: string,
  f: Fundamentals,
  price: number,
  s200: number | null,
): string {
  const quality =
    f.returnOnEquity !== null
      ? f.returnOnEquity > 0.18
        ? 'a high-quality, high-return business'
        : f.returnOnEquity > 0.1
          ? 'a decently profitable business'
          : 'a low-return business'
      : 'a business whose returns Yahoo does not disclose';

  const value =
    f.peRatio !== null
      ? f.peRatio < 18
        ? `an undemanding P/E of ${f.peRatio.toFixed(1)}`
        : f.peRatio < 30
          ? `a fair P/E of ${f.peRatio.toFixed(1)}`
          : `a rich P/E of ${f.peRatio.toFixed(1)}`
      : 'a valuation Yahoo does not fully disclose';

  const trend =
    s200 !== null
      ? price > s200
        ? 'and the long-term price trend agrees (above the 200-day average)'
        : 'but the long-term price trend is against it (below the 200-day average)'
      : '';

  const verb =
    verdict === 'STRONG_BUY' || verdict === 'BUY'
      ? 'On a multi-year view this looks like a business worth accumulating on weakness rather than chasing.'
      : verdict === 'HOLD'
        ? 'On a multi-year view it is a reasonable hold but not a compelling new purchase at these levels.'
        : 'On a multi-year view the combination of fundamentals and trend does not justify a long-term position yet.';

  return `Over months to years, this is ${quality} at ${value}, ${trend}, scoring ${score}/100 on the long-term checks. ${verb}`;
}
