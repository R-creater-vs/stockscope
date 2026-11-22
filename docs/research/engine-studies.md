# All three scores, one test

The app shows three scores: short-term (swing, days to weeks), mid-term (weeks to months) and long-term. This page puts all three through the same study, with the same data, statistics and pass mark, so their evidence can be compared directly. The mid-term score has its own full write-up: [mid-engine study](mid-engine-study.md). The plan for the other two was committed before they were run: [short and long re-measurement plan](short-long-remeasurement-plan.md).

## Answer in five lines

1. **No score passes.** None of the three clears the pass mark fixed in advance, in either period.
2. **The app's correlation reads negative even on random prices.** The app measures the correlation inside each stock's own history, and shuffled prices read −0.02 to −0.25 on it, depending on the horizon. In all six engine-and-period results, the real 95% interval contains at least one of the three shuffled readings.
3. **None ranks stocks.** On any given day, higher-scored stocks did not beat lower-scored ones. All six daily rank correlations (IC) have intervals that include zero.
4. **Buy-and-hold won every time.** Trading any of the scores returned less per stock than holding the stock, in both periods.
5. **The short score's old "regime-dependent" story does not hold up.** Its sign did change between the two periods again, but the 2019–2022 reading cannot be told apart from zero or from shuffled prices.

## What was tested

| | Short (swing) | Mid (weeks to months) | Long-term price proxy |
| --- | --- | --- | --- |
| Code | `analyzeSwing`, `src/lib/swing.ts`, 8 inputs | `src/lib/midterm.ts`, 7 inputs | `longTrendStrategy`, `src/lib/backtest.ts` |
| Forward horizon | 10 sessions | 20 sessions | 60 sessions |
| Trades | Next open on a buy verdict; stop, first target or 15 sessions | Next open on a buy verdict; stop, target or 40 sessions | Next open on a buy verdict; 3×ATR stop, 8×ATR target or 90 sessions |
| Bootstrap block | 20 sessions | 40 sessions | 120 sessions |
| Status of the test | Re-measurement: both windows were run in July 2026 with the correlation alone | Pre-registered; 2019–2022 held out | Re-measurement of the recent window; 2019–2022 is a first look |

**The long-term proxy is not the app's long-term score.** The real long-term score is built from company fundamentals, which cannot be replayed day by day without a point-in-time history of those fundamentals. The proxy (price above a rising 200-day average, 6- and 12-month momentum) is the only long-horizon rule that can be tested honestly. Its result says nothing about the fundamental score.

Everything else is shared: 165 liquid NSE stocks and the Nifty 50 from Yahoo, the app's own engine and backtest code, 0.2% round-trip costs, 2,000 block-bootstrap replicates (seed 20261122), trades resampled by month of entry, and three shuffled-price runs (seeds 1–3). The study stops unless its own samples reproduce the app's correlation to within 10⁻⁹, and all six runs passed that check. All six runs used the bar filter fixed in the plans. The placeholder-bar fix that came after made no material difference to the mid engine ([sensitivity check](mid-engine-study.md#after-the-study-the-placeholder-bar-fix)). The short and long runs were not repeated with it.

**Pass mark** (the same for all three): in both periods, a correlation interval above zero with an estimate above 0.05, **and** a profit-per-trade interval above zero with an estimate above 0.03R.

## Results

Square brackets are 95% intervals. "Shuffled" is the same measure after each stock's days were shuffled in time, so nothing could be predicted (the mean of three shuffles, with the individual runs in the next section).

| Score | Period | Daily obs. | Correlation (app's measure) | Shuffled | Real − shuffled | Daily rank correlation (IC) | Shuffled IC | Trades | Profit per trade | Profit factor | Trading the score vs buy-and-hold, per stock | Pass? |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| Short | Oct 2024 – Nov 2026 | 85,302 | −0.073 [−0.136, −0.037] | −0.034 | −0.039 | −0.015 [−0.046, +0.016] | −0.009 | 6,247 | −0.063R [−0.201, +0.100] | 0.78 [0.61, 0.96] | −19.9% vs +1.1% | No |
| Short | 2019 – Dec 2022 | 154,489 | +0.012 [−0.075, +0.099] | −0.024 | +0.036 | −0.017 [−0.044, +0.010] | −0.006 | 12,770 | +0.040R [−0.040, +0.118] | 1.09 [0.91, 1.29] | +18.5% vs +121.4% | No |
| Mid | Oct 2024 – Oct 2026 | 83,652 | −0.199 [−0.291, −0.135] | −0.124 | −0.075 | −0.008 [−0.065, +0.050] | −0.034 | 2,046 | −0.136R [−0.299, +0.020] | 0.79 [0.57, 1.09] | −10.7% vs +1.1% | No |
| Mid | 2019 – Dec 2022 | 152,859 | −0.049 [−0.141, +0.025] | −0.066 | +0.017 | +0.001 [−0.043, +0.045] | −0.011 | 4,231 | +0.119R [+0.007, +0.227] | 1.37 [1.05, 1.77] | +51.1% vs +121.4% | No |
| Long proxy | Oct 2024 – Aug 2026 | 77,068 | −0.293 [−0.437, −0.196] | −0.253 | −0.040 | +0.018 [−0.099, +0.132] | −0.072 | 1,252 | −0.176R [−0.448, +0.121] | 0.77 [0.46, 1.24] | −9.7% vs +1.1% | No |
| Long proxy | 2019 – Oct 2022 | 146,339 | −0.099 [−0.253, +0.008] | −0.137 | +0.038 | +0.038 [−0.039, +0.110] | −0.032 | 2,357 | +0.276R [+0.087, +0.455] | 1.60 [1.21, 2.08] | +76.3% vs +121.4% | No |

The recent windows end on different dates because each engine needs its own number of sessions of future prices after the last decision. Every 2019–2022 window starts on 2019-01-01 and covers 163 of the 165 stocks. Six-figure counts use international grouping here; the app shows Indian grouping.

### The shuffled baseline, run by run

| Score | Period | Real interval | Shuffled runs (seeds 1, 2, 3) |
| --- | --- | --- | --- |
| Short | Recent | −0.136 to −0.037 | −0.032, −0.033, **−0.038** |
| Short | 2019–2022 | −0.075 to +0.099 | **−0.022, −0.025, −0.026** |
| Mid | Recent | −0.291 to −0.135 | −0.113, −0.119, **−0.141** |
| Mid | 2019–2022 | −0.141 to +0.025 | **−0.067, −0.075, −0.056** |
| Long proxy | Recent | −0.437 to −0.196 | **−0.223, −0.257, −0.279** |
| Long proxy | 2019–2022 | −0.253 to +0.008 | **−0.131, −0.161, −0.119** |

Bold runs fall inside the real interval. In the recent period, the short and mid intervals sit just below the *average* of their shuffles, and the app's "inverted" rule compares against that average. Even there, one shuffle lands inside the real interval, so neither reading is clearly worse than chance. The longer the horizon, the stronger the baseline: about −0.03 at 10 sessions, −0.07 to −0.12 at 20 and −0.14 to −0.25 at 60. That is what the bias predicts. Within one stock's fixed start and end, a long forward window leaves less room for an earlier move to be repeated.

### Reading the results engine by engine

**Short (swing).** In the recent period the correlation was −0.073, about twice its shuffled baseline. Its interval excludes zero but contains one of the three shuffles. In 2019–2022 it was +0.012, with an interval that includes both zero and the baseline. The daily rank correlation was slightly negative in both periods (−0.015 and −0.017), and both intervals include zero. Trades lost money in the recent period: the profit-factor interval of 0.61 to 0.96 is wholly below 1, though the per-trade interval in R includes zero. In 2019–2022 trades roughly broke even. Trading the score returned −19.9% per stock against +1.1% for holding, then +18.5% against +121.4%.

**Mid.** See the [full mid-engine study](mid-engine-study.md). The shuffled baseline is three-fifths of the recent reading, and the 2019–2022 reading sits slightly above its baseline. Profit per trade in 2019–2022 has an interval above zero, as does the long proxy's. The correlation in that period does not, and holding each stock made more than twice as much.

**Long-term proxy.** The largest correlations (−0.293 and −0.099) come with the largest baselines (−0.253 and −0.137). The baseline is 86% of the recent reading and larger than the 2019–2022 one, and neither interval excludes its baseline. Trades made +0.276R each in 2019–2022, with an interval above zero, but the shuffled runs, which have no timing skill, made +0.20R to +0.21R there. In the recent period the shuffled runs made +0.21R to +0.24R while the real trades lost 0.176R. Shuffled trades are not a like-for-like baseline: shuffling spreads each stock's drift over its whole download, including the warm-up years. **The intervals are rough.** With 120-session blocks, the recent window holds about four blocks and 2019–2022 about eight. The plan stated this in advance.

### The pattern across engines

All three scores did a little worse than their shuffled baseline in the recent period (−0.039, −0.075, −0.040) and a little better in 2019–2022 (+0.036, +0.017, +0.038). That is what trend-following rules are expected to do: help slightly in a steadily rising market and hurt slightly in a choppy one. But no single difference is clearly outside its noise. And the three engines share the same stocks, the same prices and overlapping trend inputs, so this is one pattern seen three times, not three independent confirmations. It is a reason to test again on future data, not an edge.

### The short score's "regime-dependent" story

The July 2026 record read −0.072 for 2023–2026 and +0.026 for 2019–2022, and its code comment called the sign change "proof it is regime-dependent". The re-measurement reproduces the pattern (−0.073 and +0.012), but it does not support the conclusion:

- The 2019–2022 interval (−0.075 to +0.099) includes zero and the shuffled baseline. One of the two readings cannot be distinguished from no signal at all.
- Splitting each period by the market's own regime (Nifty 50 above or below its 50-day EMA) shows no flip. In the recent period both halves are negative: −0.069 [−0.141, −0.021] in uptrends and −0.083 [−0.138, −0.056] in downtrends. In 2019–2022 both include zero: −0.020 [−0.068, +0.017] and −0.008 [−0.139, +0.091]. Both 2019–2022 halves read below the whole period's +0.012. That can happen with this measure, because each half's correlation is computed within the half, which removes the difference between rising and falling stretches.
- Using only every 10th date (no overlapping forward windows) gives the same picture: a mean of −0.070 in the recent period, with all 10 offsets negative, and +0.014 in 2019–2022, with offsets on both sides of zero.

What is left is a difference between two periods that is small, partly produced by the measure, and not tied to the market regime that the app itself tracks. The app now says "no demonstrated edge", and the July figures stay visible as the earlier record.

### Short engine inputs

All 16 per-input daily rank correlations (eight inputs, two periods) have intervals that include zero. In the drop-one check, three intervals exclude zero in the recent period (20/50 EMA alignment, ADX, RSI) and two in 2019–2022 (20/50 EMA alignment, MACD). Only one input repeats with the same sign: removing 20/50 EMA alignment raises the correlation by about 0.01 in both periods. Its own rank correlation includes zero in both. A shift of 0.01 on a measure whose shuffled baseline is −0.03 is not an edge, and with 16 intervals some will exclude zero by chance. As for the mid engine, nothing was changed because of this table.

## What changed in the app

`src/lib/validation.ts` now holds all three records with both windows, their intervals, the shuffled baseline, the daily rank correlation, trade counts and strategy against buy-and-hold. The July 2026 figures are kept in each record's `previous` field. The status rule is the one fixed in the plans: *validated* needs every window to pass the bar above, and *inverted* needs every window's correlation interval to sit wholly below its shuffled average. All three engines come out as *no edge*. The text beside each score is generated from the record's own numbers, and each interpretive phrase appears only when the figures support it. For example, "much of that reading comes from the measure itself" is shown for mid and long but not for short, whose recent baseline is less than half its reading. `tests/validation.test.mjs` checks the statuses, the held-out flags and that each phrase is earned.

## Limits

- **Re-measurement, not new evidence, for the short engine.** Both of its windows had been looked at before. Only the mid engine's 2019–2022 window and the long proxy's 2019–2022 window were unseen when their plans were written.
- **Many comparisons.** Three engines × two periods × several statistics give many chances for one number to look interesting. The pass mark was fixed in advance to guard against this, and none of the conclusions above rests on a single interval.
- **Survivorship.** The universe is today's list of 165 stocks, so failures that left the market before 2026 are missing. Over the short engine's 2019–2022 window, the equal-weighted stock return was +126.9% against +68.2% for the Nifty 50, with a median of +57.6%. This flatters long-only trading and makes buy-and-hold a demanding comparison. See the [mid study](mid-engine-study.md#survivorship-bias) for the full measurement.
- **Data.** Yahoo daily bars, not dividend-adjusted, from a single source. The data-quality findings in the mid study apply to the same downloads.
- **One shuffled trade run is an outlier.** Short 2019–2022 seed 3 averaged +0.29R per trade with a profit factor of 1.00, so a handful of extreme trades dominate its mean. Shuffled trades are not used in any decision.

## Reproduce

```bash
node scripts/research/engine-study.mjs --engine short --window recent --null 3 --keep-placeholder-bars
node scripts/research/engine-study.mjs --engine short --window 2019-2022 --null 3 --keep-placeholder-bars
node scripts/research/engine-study.mjs --engine long --window recent --null 3 --keep-placeholder-bars
node scripts/research/engine-study.mjs --engine long --window 2019-2022 --null 3 --keep-placeholder-bars
```

Each run takes from a minute (long proxy) to about half an hour (short, 2019–2022), reuses the cached downloads in `.data/research/`, and writes `docs/research/results/<engine>-<window>.json`. `--keep-placeholder-bars` reproduces the bar filter the plans fixed. The mid commands are in the [mid study](mid-engine-study.md#reproduce-it).
