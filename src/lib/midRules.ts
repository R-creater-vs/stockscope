/**
 * Plain-language rules for the seven mid-term (position) score inputs.
 *
 * Display only. These sentences mirror `analyzeMidTerm` in `midterm.ts`; they
 * compute nothing and must be updated together with that engine. Keeping them
 * in a dependency-free module lets the report show them without shipping the
 * engine to the browser.
 */

export interface RuleInput {
  name: string;
  category: 'Trend' | 'Momentum' | 'Structure';
  weight: number;
  rule: string;
  lookback: string;
}

export const MID_INPUTS: RuleInput[] = [
  {
    name: 'Price vs 50 & 200-day SMA',
    category: 'Trend',
    weight: 20,
    rule: '+1 when the close is above both the 50- and 200-day simple averages; −1 when below both; +0.3 when above only the 200-day; −0.3 when above only the 50-day.',
    lookback: '200 daily closes',
  },
  {
    name: '50/200 SMA structure',
    category: 'Trend',
    weight: 16,
    rule: 'Gap between the 50- and 200-day averages, scaled in a straight line from −8% (−1) to +8% (+1) and capped at both ends. Labelled bullish above +1% and bearish below −1%.',
    lookback: '200 daily closes',
  },
  {
    name: 'Weekly trend',
    category: 'Trend',
    weight: 16,
    rule: '+1 when the weekly close is above the 10-week EMA and the 10-week EMA is above the 30-week EMA; −1 for the reverse order; 0 otherwise. The current week counts with its latest close.',
    lookback: 'At least 32 weekly bars built from the daily series',
  },
  {
    name: 'Trend strength (ADX)',
    category: 'Trend',
    weight: 12,
    rule: 'When ADX(14) is above 22: plus or minus min(1, (ADX − 15) ÷ 20), positive when +DI leads −DI. At 22 or below the input is 0.',
    lookback: 'At least 28 daily bars (Wilder smoothing)',
  },
  {
    name: '3 & 6-month momentum',
    category: 'Momentum',
    weight: 14,
    rule: 'Average of the 63- and 126-session percentage price changes, scaled from −20% (−1) to +25% (+1) and capped at both ends.',
    lookback: '127 daily closes',
  },
  {
    name: 'RSI (14)',
    category: 'Momentum',
    weight: 8,
    rule: 'RSI 80 or above: −0.3; 50 to below 80: +0.5; 40 to below 50: +0.1; 30 to below 40: −0.4; below 30: −0.2.',
    lookback: '15 daily closes, Wilder smoothing',
  },
  {
    name: 'Position in 52-week range',
    category: 'Structure',
    weight: 14,
    rule: 'Where the close sits between the lowest low and highest high of the last 252 daily bars (all bars if fewer), scaled from 25% of the range (−1) to 90% (+1).',
    lookback: 'Up to 252 daily bars',
  },
];

export const MID_SCORE_NOTE =
  'Score = 50 + Σ 50 × weight × input ÷ available weight, rounded to one decimal; 72+ strong bullish bias, 58–71.9 bullish bias, 40–57.9 mixed, below 40 bearish bias. Confidence = 60% signal agreement + 40% trend clarity, where clarity rises from ADX 12 to 35. Neither is a probability of profit.';
