# Mid-term engine study: analysis plan (pre-registration)

Written and committed on **22 November 2026, before the 2019–2022 window was run** for the mid-term engine. The git history shows this file was committed before the results file. Nothing below may be changed after the results are seen; any later change must be added as a dated amendment at the end, with its reason.

## What is being tested

The **mid-term (weeks-to-months) engine** in `src/lib/midterm.ts`, exactly as committed in `1b26836`. Its rules, weights and thresholds are frozen; the 18 regression cases in `scripts/verify-redesign-math.mjs` pin every number it returns. The trade rules are `ENGINE_CONFIGS.mid` in `src/lib/backtest.ts`:

- **Signal study:** each day's score against the price change 20 sessions later.
- **Trades:** enter at the next session's open when the score is 58 or higher and the stop and target are valid; exit at the stop (gaps fill at the open), the first target, or after 40 sessions; stop assumed first if both are touched in one bar; 0.2% round-trip cost; one position per stock at a time.
- **No look-ahead:** on each decision day the engine sees only bars up to that day's close.

## Hypothesis

**H1.** A higher mid-term score is followed by a higher 20-session forward return, and trading the score's buy signals has positive net expectancy.

H1 is supported only if **both** hold in **both** windows:

1. the pooled correlation (defined below) has a 95% confidence interval entirely above 0, and its point estimate is above 0.05;
2. net expectancy per trade has a 95% confidence interval entirely above 0, and its point estimate is above 0.03R.

The point-estimate thresholds are the ones `validationStatus()` in `src/lib/validation.ts` already uses. If H1 is not supported, the result is reported as **no demonstrated edge**, whatever the direction. A negative correlation does **not** support an inverse strategy, because that strategy was not specified in advance.

## Windows

| Window | Decisions counted | Data fetched |
| --- | --- | --- |
| **Recent** | From the 211th session of a trailing 3-year fetch to the latest bar (about two years), as the app's default study does | Trailing 3 years from the run date |
| **2019–2022 (held out)** | 2019-01-01 to 2022-12-31 inclusive | 2017-08-19 to 2022-12-31: the window plus a 500-calendar-day warm-up, as the app's windowed study does |

The windows do not overlap. The mid engine has never been run on 2019–2022, so it is genuinely unseen data for this engine. (The short engine's earlier 2019–2022 run did not record its exact dates; these are fixed here.)

## Universe and data

The app's current universe (`src/lib/universe.ts`, 165 NSE stocks), daily bars from Yahoo through the same filter as the app (`toBars` in `src/lib/yahoo.ts`: a row is kept only if open, high, low, close and volume are all present). A stock is studied only if it has at least 240 bars (the app's `warmup + 30` rule). Prices are not dividend-adjusted.

Known bias, stated in advance: the universe is **today's** list, so stocks that were delisted or fell out of favour before today are missing (survivorship bias). This is measured, not corrected; see "Limits measured" below.

## Statistics

**Primary.** These are computed with the app's own code (`backtestSymbol` and `aggregate` in `src/lib/backtest.ts`), so they match the app's Strategy check:

- **Pooled correlation:** each stock's Pearson correlation between score and 20-session forward return, averaged with weights equal to its number of samples (`pooledCorrelation`).
- **Net expectancy** (mean R per trade after costs), profit factor, win rate, number of trades.

**Confidence intervals.** These come from a **circular block bootstrap over trading dates**: 2,000 replicates, blocks of 40 sessions (twice the 20-session horizon), seed 20261122. Every stock's sample on a resampled date is kept together. This preserves both the overlap between consecutive 20-day windows and the fact that stocks move together on the same day. Trade statistics are bootstrapped by resampling **calendar months of entry**, so trades entered in the same month stay together. A percentile interval is reported (2.5th to 97.5th percentile).

**Secondary (exploratory, not used to accept or reject H1):**

- Mean daily cross-sectional **Spearman rank correlation** (information coefficient, IC) between score and forward return, on dates with at least 10 stocks.
- Forward-return spread between the top score bucket (72+) and the bottom bucket (below 40).
- **Per-input analysis** for each of the seven inputs: its own mean daily IC, and a **drop-one ablation** in which the score is recomputed without that input (weights renormalised, as the engine already does for missing inputs) and the change in pooled correlation is reported.
- **Regime split:** pooled correlation on days when the Nifty 50 closed above versus below its 50-day EMA (the app's existing market filter).
- **Non-overlapping check:** pooled correlation using only every 20th trading date, for each of the 20 possible starting offsets.

Seven inputs × two windows × several statistics is a large number of comparisons. Some secondary results will look notable by chance. **No rule, weight or threshold will be changed because of these results.** Any idea they suggest would need a new, untouched holdout period before it could be called evidence.

## Limits measured

- **Survivorship proxy:** the equal-weighted buy-and-hold return of the studied stocks over each window, against the Nifty 50 price index over the same dates. Today's survivors outperforming the index is consistent with survivorship and selection bias; the gap is an upper bound on what selection could explain, not a measurement of the bias itself.
- **Coverage:** stocks attempted, fetched, and excluded for short history; stocks whose first bar falls after the window starts.
- **Data quality:** rows dropped by the completeness filter, zero-volume bars, one-day closes moving more than 20% (possible unadjusted corporate actions or bad prints), duplicate dates, and sessions where the Nifty 50 traded but the stock has no bar.

## What happens with the result

The results and this plan are published together in `docs/research/mid-engine-study.md`, including any result that is unfavourable. The 2019–2022 figures are added to the mid engine's record in `src/lib/validation.ts` next to the recent window, using the definitions above. The earlier record (measured 2026-07-24) stays documented.

## Amendments

### Amendment 1: 22 November 2026, after the recent-window run, before the 2019–2022 run

**What was seen.** In the recent window the pooled correlation was −0.199 (95% CI −0.291 to −0.135), while the mean daily cross-sectional IC was −0.008 (95% CI −0.065 to 0.050).

**Why that matters.** The pooled correlation is computed *within* each stock's own history, against that stock's own sample mean. For a score built from past price trends, such within-sample correlations can be negative even when prices are unpredictable: if a stock's path over the sample has a fixed start and end, a strong past rise leaves less room for a later rise. If this bias is large, part or all of the "inverted" result is a property of the metric, not of the market.

**Added analysis: null calibration.** For each stock, the daily bars are shuffled in time with a seeded generator. Each day keeps its own close-to-close return, its open relative to the previous close, and its high and low relative to its close, but the order of days is randomised. This keeps each stock's volatility, drift and candle shapes and removes any predictability. The same engine, trade rules and statistics are run on the shuffled data. Three shuffles per window, seeds 1, 2 and 3. The pooled correlation and mean daily IC on real data are then compared with their values under this null.

**What does not change.** H1, the primary statistics, the windows, the bootstrap and the decision rule above are unchanged. The null calibration is reported beside them and is used only to interpret the size and sign of the pooled correlation.
