/**
 * Turns the computed analysis into prose.
 *
 * Two backends, same interface:
 *   - `template`  — deterministic, always available, zero setup.
 *   - `ollama`    — a local model, used automatically when one is running.
 *
 * The LLM is given the *already computed* numbers and asked only to explain
 * them. It is never asked to calculate, look anything up, or predict a price.
 * If it goes off the rails or the server is down, we fall back to the template
 * silently — a working report beats a broken one.
 */

import type { SwingAnalysis } from './swing';
import type { CompanyData } from './yahoo';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

export interface Narrative {
  text: string;
  source: 'template' | 'ollama';
}

export async function buildNarrative(
  company: CompanyData,
  analysis: SwingAnalysis,
  options: { allowAI?: boolean; signal?: AbortSignal } = {},
): Promise<Narrative> {
  const fallback = templateNarrative(company, analysis);
  if (options.allowAI === false) return { text: fallback, source: 'template' };

  try {
    const text = await ollamaNarrative(company, analysis, options.signal);
    // Keep figures in deterministic components. If the model introduces any
    // numerical prose, use the computed template instead of displaying it.
    const hasFigures = /\p{N}|[₹%]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore|million|billion|percent|percentage)\b/iu.test(text);
    if (text && text.length > 80 && !hasFigures) return { text, source: 'ollama' };
  } catch {
    // Ollama absent or slow — the template is a perfectly good answer.
  }
  return { text: fallback, source: 'template' };
}

export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ollamaNarrative(company: CompanyData, analysis: SwingAnalysis, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: buildPrompt(company, analysis),
      stream: false,
      options: { temperature: 0.3, num_predict: 500 },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
  });

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return (data.response ?? '').trim();
}

function buildPrompt(company: CompanyData, a: SwingAnalysis): string {
  const facts = a.signals.map((s) => `- ${s.name} [${s.direction}]: ${s.detail}`).join('\n');
  const risks = a.riskFlags.length ? a.riskFlags.map((r) => `- ${r}`).join('\n') : '- None flagged.';
  const plan = a.plan
    ? `Entry ₹${a.plan.entryLow.toFixed(2)}-₹${a.plan.entryHigh.toFixed(2)}, stop ₹${a.plan.stopLoss.toFixed(2)}, target ₹${a.plan.target1.toFixed(2)}, risk:reward ${a.plan.riskReward.toFixed(2)}:1`
    : 'No trade plan (insufficient volatility data).';

  return `You are a disciplined swing-trading analyst writing for an Indian retail trader who holds positions for days to weeks.

Write a 3-paragraph analysis of ${company.profile.name} (${company.profile.symbol}), currently trading at ₹${company.quote.price.toFixed(2)}.

RULES — follow these exactly:
1. Explain qualitatively. Do not output any numbers, dates, prices, percentages, ratios, number words, or calculations. The interface displays all figures directly from deterministic code. Never invent a news event.
2. Do not predict future prices, profits, hit rates, or a trading edge. The weighted swing model has no demonstrated stable trading edge. A bullish rule direction does not establish a profitable entry.
3. Write in plain, direct English. No hype, no emoji, no bullet lists.
4. Paragraph 1: describe the observed price structure. Paragraph 2: explain conflicting evidence and risk. Paragraph 3: explain what the displayed illustrative trade plan means, including gap risk and the model's lack of demonstrated edge. Do not instruct the reader to buy or sell.
5. Confidence measures agreement and trend clarity, adjusted for weekly alignment; it is never a probability of profit. Do not claim that an inverted score has a proven edge.

COMPUTED VERDICT: ${a.verdict} (technical score ${a.score}/100, confidence ${a.confidenceLabel})

HIGHER TIMEFRAME (weekly): ${a.weekly ? a.weekly.detail : 'Not enough history to assess.'}

SIGNALS:
${facts}

RISK FLAGS:
${risks}

TRADE PLAN: ${plan}

Write the three paragraphs now, nothing else.`;
}

/** Deterministic prose assembled from the same signals. Always works. */
function templateNarrative(company: CompanyData, a: SwingAnalysis): string {
  const name = company.profile.name;
  const price = `₹${company.quote.price.toFixed(2)}`;
  const s = a.snapshot;

  const verdictPhrase: Record<SwingAnalysis['verdict'], string> = {
    STRONG_BUY: 'a strong bullish direction in the weighted rules',
    BUY: 'a bullish direction in the weighted rules',
    HOLD: 'mixed evidence in the weighted rules',
    AVOID: 'a bearish direction in the weighted rules',
  };

  const paras: string[] = [];

  // --- What the tape is doing -----------------------------------------------
  const trendBits: string[] = [];
  if (s.ema20 !== null && s.ema50 !== null) {
    trendBits.push(
      s.price > s.ema20 && s.price > s.ema50
        ? `trading above both its 20- and 50-day EMAs`
        : s.price < s.ema20 && s.price < s.ema50
          ? `trading below both its 20- and 50-day EMAs`
          : `caught between its 20- and 50-day EMAs`,
    );
  }
  if (s.rsi14 !== null) trendBits.push(`an RSI of ${s.rsi14.toFixed(1)}`);
  if (s.adx14 !== null)
    trendBits.push(
      s.adx14 > 25
        ? `an ADX of ${s.adx14.toFixed(1)}, confirming a real trend`
        : `an ADX of only ${s.adx14.toFixed(1)}, which means the stock is chopping rather than trending`,
    );

  paras.push(
    `${name} is at ${price}, ${company.quote.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(company.quote.changePercent).toFixed(2)}% on the day, ${trendBits.join(', ')}. ` +
      `Across the eight technical checks this engine runs, the stock scores ${a.score} out of 100, which reads as ${verdictPhrase[a.verdict]}. ` +
      (s.volumeRatio !== null
        ? `Volume is running at ${s.volumeRatio.toFixed(2)}x its 20-day average, so participation is ${s.volumeRatio > 1.3 ? 'heavy' : s.volumeRatio < 0.8 ? 'light' : 'ordinary'}.`
        : '') +
      (a.weekly && a.weekly.trend !== 'neutral'
        ? ` Zooming out, the weekly chart is in ${a.weekly.trend === 'bullish' ? 'an uptrend, so the bigger tide is with a long' : 'a downtrend, so a long here is fighting the higher timeframe'}.`
        : ''),
  );

  // --- The case against ------------------------------------------------------
  const against =
    a.bearPoints.length > 0
      ? `The clearest argument against acting here: ${lowerFirst(a.bearPoints[0])}` +
        (a.bearPoints.length > 1 ? ` ${a.bearPoints[1]}` : '')
      : `No individual signal is labelled bearish. Agreement among related technical indicators does not establish that a trade will be profitable.`;
  const riskLine = a.riskFlags.length ? ` ${a.riskFlags[0]}` : '';
  paras.push(against + riskLine);

  // --- What to actually do ---------------------------------------------------
  if (a.plan && (a.verdict === 'BUY' || a.verdict === 'STRONG_BUY')) {
    paras.push(
      `The illustrative trade plan uses an entry zone between ₹${a.plan.entryLow.toFixed(2)} and ₹${a.plan.entryHigh.toFixed(2)}, ` +
        `a stop at ₹${a.plan.stopLoss.toFixed(2)} (₹${a.plan.riskPerShare.toFixed(2)} of risk per share), and a first target at ₹${a.plan.target1.toFixed(2)} — ` +
        `a reward-to-risk of ${a.plan.riskReward.toFixed(2)}:1. ` +
        `These are model levels, not price forecasts; gaps, liquidity and costs can increase losses beyond the planned stop. ` +
        `Rule confidence is ${a.confidenceLabel.toLowerCase()} (${a.confidence}/100), based on signal agreement, trend clarity and weekly alignment. It is not a probability of profit. The model has no demonstrated stable trading edge.`,
    );
  } else if (a.verdict === 'HOLD') {
    paras.push(
      `The model currently describes a mixed setup. ` +
        (a.levels.resistance[0]
          ? `The nearest identified resistance is ₹${a.levels.resistance[0].toFixed(2)}; `
          : '') +
        (a.levels.support[0]
          ? `the nearest identified support is ₹${a.levels.support[0].toFixed(2)}. `
          : '') +
        `These historical levels may not hold. Rule confidence is ${a.confidenceLabel.toLowerCase()} (${a.confidence}/100), not a probability of profit. The model has no demonstrated stable trading edge.`,
    );
  } else {
    paras.push(
      `The weighted rules currently describe bearish structure. ` +
        (a.levels.resistance[0]
          ? `The nearest identified resistance is ₹${a.levels.resistance[0].toFixed(2)}. `
          : '') +
        `This describes current inputs and does not forecast a decline. Rule confidence is ${a.confidenceLabel.toLowerCase()} (${a.confidence}/100), not a probability of profit. The model has no demonstrated stable trading edge.`,
    );
  }

  return paras.join('\n\n');
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
