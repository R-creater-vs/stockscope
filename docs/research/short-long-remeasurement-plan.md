# Short engine and long-term proxy: re-measurement plan

Written and committed on **22 November 2026, before either engine was run** with the methods below. It extends the [mid-term plan](mid-engine-preregistration.md) to the app's other two scores, so all three are judged the same way. Any later change goes in a dated amendment at the end.

## Why

The mid-term study found that the app's pooled correlation measures a trend score *within* each stock's own history, and that this reads negative even on shuffled, unpredictable prices (−0.124 and −0.066 for the mid engine). The short and long records still rest on that measure alone, with no intervals and no baseline. The short record's code comment calls its sign change between two periods "proof it is regime-dependent". This re-measurement checks whether those stories survive the same tests.

## Status of this test: re-measurement, not a held-out test

Be clear about what has already been looked at:

| Engine | Recent window | 2019–2022 window |
| --- | --- | --- |
| Short (swing) | Examined in July 2026 (pooled correlation only) | Examined in July 2026 (pooled correlation only); exact dates not recorded |
| Long-term price proxy | Examined in July 2026 (pooled correlation only) | No earlier run recorded |

So for the short engine **neither window is unseen**, and this is a re-measurement with better statistics, not a fresh out-of-sample test. For the long proxy the 2019–2022 window is a first look. No engine rule, weight or threshold is changed in either case.

## What is tested

| | Short (swing) engine | Long-term price-trend proxy |
| --- | --- | --- |
| Code | `analyzeSwing` in `src/lib/swing.ts` (8 weighted inputs) | `longTrendStrategy` in `src/lib/backtest.ts`: above a rising 200-day SMA, 6/12-month momentum. **Not** the app's fundamental long-term score, which cannot be replayed without point-in-time fundamentals |
| Trade rules (`ENGINE_CONFIGS`) | Enter next open on a BUY verdict or better; exit at stop, first target or 15 sessions | Enter next open on a BUY verdict or better; stop 3×ATR, target 8×ATR, or 90 sessions |
| Forward horizon (signal study) | 10 sessions | 60 sessions |
| Bootstrap block | 20 sessions (2 × horizon) | 120 sessions (2 × horizon) |

Everything else is identical to the mid-term plan: the same universe and data (the same cached downloads), the same two windows, 2,000 block-bootstrap replicates with seed 20261122, trades bootstrapped by month of entry, three shuffled-price runs (seeds 1–3), the daily rank correlation (IC), score buckets, regime split, non-overlapping check, and per-input IC and drop-one ablation for the short engine (the proxy has no separate inputs).

**Decision rule** (unchanged): an edge needs, in both windows, a correlation interval above zero with an estimate above 0.05 **and** an expectancy interval above zero with an estimate above 0.03R. "Inverted" in the app requires every window's correlation interval to sit wholly below its shuffled-price baseline.

**Known weakness, stated in advance:** with a 60-session horizon and 120-session blocks, a recent window of about 470 decision dates holds only about four blocks, so the long proxy's intervals will be rough. Its result is reported with that caveat.

## What happens with the result

The short and long records in `src/lib/validation.ts` are replaced by the re-measured windows, with their intervals and baselines, and the earlier July 2026 figures stay visible as `previous`. The app's text for each engine is updated to match the new result, whatever it is. Results are written to `docs/research/results/{short,long}-{recent,2019-2022}.json` and summarised in `docs/research/engine-studies.md`.
