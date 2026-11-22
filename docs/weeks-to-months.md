# Weeks-to-months analysis

NIVRA remains a **provisional** name (see [brand.md](brand.md)). This document explains what the app analyses for a stock held for **weeks to months**, the exact rules behind every reading, where the data comes from, and what has and has not been tested. Written 22 November 2026 alongside the code change it describes.

> **Status in one line:** the mid-term score has **no demonstrated stable edge**. The weeks-to-months evidence added here is descriptive, sits beside that score, and has **not** been historically tested. Nothing in this change was validated, and no test or verification script was run while making it.
>
> **Update, 22 November 2026:** the score itself was re-tested under a pre-registered plan, on a recent period and a held-out 2019–2022 period, with 95% intervals and a shuffled-price baseline. Result: no demonstrated edge in either period, and most of the earlier negative correlation turned out to come from the measuring method. See [the study](research/mid-engine-study.md). The candle and indicator rules described below now have 42 rule tests (`npm test`); those tests check that the rules behave as written, not that they predict anything.

## 1. Which engine is "weeks to months"

The app already had three horizons, each with its own engine. "Weeks to months" is the existing **mid-term (position) engine** in [`midterm.ts`](../src/lib/midterm.ts). Nothing was relabelled or merged.

| Horizon | Engine | What it reads |
| --- | --- | --- |
| Short · days to weeks | `swing.ts` | Eight momentum/breakout/volume rules |
| **Mid · weeks to months** | **`midterm.ts`** | **50/200-day regime, weekly trend, 3/6-month momentum, ADX, RSI, 52-week position** |
| Long · months to years | `longterm.ts` | Fundamentals plus a long trend check |

"Weeks to months" is not a precise holding period, and the app does not pretend otherwise. The only precise numbers are the ones the historical study uses (from `ENGINE_CONFIGS.mid` in [`backtest.ts`](../src/lib/backtest.ts)):

- **Signal study:** score compared with the price change **20 sessions** later (about four weeks).
- **Trade simulation:** entry at the **next session's open** when the score is 58 or higher; exit at the model stop, the first target, or after **40 sessions** (about eight weeks); **0.2%** round-trip cost assumed; if one bar touches both stop and target, the stop is assumed first.

The per-stock **History check** in a report replays the **short-term** rules only. The report now says so when the mid or long view is selected; previously its prompt read as if the selected strategy was being replayed.

## 2. What the mid-term score measures (unchanged)

The score's arithmetic was not changed. Its numeric outputs are covered by the frozen regression cases in `scripts/verify-redesign-math.mjs`, which hash every number the engine returns; only explanation sentences were edited, which that check ignores. That script was not run as part of this change. The report now shows each rule next to its contribution, from [`midRules.ts`](../src/lib/midRules.ts).

| Input | Weight | Rule (input from −1 to +1) | Lookback |
| --- | ---: | --- | --- |
| Price vs 50 & 200-day SMA | 20 | +1 above both; −1 below both; +0.3 above only the 200-day; −0.3 above only the 50-day | 200 closes |
| 50/200 SMA structure | 16 | Gap between the averages scaled from −8% (−1) to +8% (+1) | 200 closes |
| Weekly trend | 16 | +1 if weekly close > 10-week EMA > 30-week EMA; −1 for the reverse; else 0 | 32+ weekly bars |
| Trend strength (ADX) | 12 | If ADX(14) > 22: ±min(1, (ADX − 15) ÷ 20), sign from +DI vs −DI; else 0 | 28+ bars |
| 3 & 6-month momentum | 14 | Mean of 63- and 126-session change, scaled from −20% (−1) to +25% (+1) | 127 closes |
| RSI (14) | 8 | ≥80: −0.3; 50–80: +0.5; 40–50: +0.1; 30–40: −0.4; <30: −0.2 | 15 closes |
| Position in 52-week range | 14 | Close within the last 252 bars' range, scaled from 25% (−1) to 90% (+1) | ≤252 bars |

**Score** = 50 + Σ 50 × weight × input ÷ available weight, rounded to one decimal. 72+ is shown as a strong bullish bias, 58–71.9 bullish bias, 40–57.9 mixed, below 40 bearish bias (internal enums unchanged). **Confidence** = 60% signal agreement + 40% trend clarity (ADX 12 → 0, ADX 35 → 1). Neither is a probability of profit. Missing inputs (for example a recent listing without 200 sessions) are excluded, the remaining weights are renormalised, and the report now lists them as "Excluded" instead of silently dropping them.

## 3. The weeks-to-months evidence (new)

Selecting **Mid-term · Weeks to months** in a report opens the evidence brief. The choice is remembered in this browser only (`localStorage`); clearing storage just returns to the default view. Other views offer a one-click switch.

### Data flow

```text
/api/analyze  (25 s overall deadline, unchanged)
 ├─ fetchBars(stock, 2 years)              existing
 ├─ fetchCompany(quote + summary)          existing
 ├─ benchmarkBars('^NSEI')                 new · shared 10-min cache · 6 s deadline
 ├─ benchmarkBars(sector index)            new · mapping in sectorBenchmarks.ts
 ├─ fetchReportedResults(dated EPS)        new · optional · 4 s deadline
 └─ buildPositionEvidence(...)             pure function → payload.position
                                            (failure → position: null; report still loads)
Report (mid view) → PositionBrief → summary rows, conflicts, seven disclosures
```

The pure modules are [`positionEvidence.ts`](../src/lib/positionEvidence.ts), [`candlePatterns.ts`](../src/lib/candlePatterns.ts), [`indicatorEvents.ts`](../src/lib/indicatorEvents.ts) and [`sectorBenchmarks.ts`](../src/lib/sectorBenchmarks.ts). Data access lives in [`benchmarks.ts`](../src/lib/benchmarks.ts) and `fetchReportedResults` in [`yahoo.ts`](../src/lib/yahoo.ts), behind an optional method on the provider interface. The UI is [`PositionBrief.tsx`](../src/components/PositionBrief.tsx). These observations never feed the score.

### Conventions used everywhere

- Every observation carries a **reading** (raw numbers), an **interpretation** (what its rule says), the **rule**, its **timeframe**, **lookback**, **as-of date** and **status** (available, partial, insufficient history, unavailable). Missing data stays missing; nothing is zero-filled.
- Returns are **price returns** from provider closes. Dividends are excluded for stocks *and* indices; the Nifty 50 used is the price index, not the total-return index.
- Yahoo updates today's daily bar while the market is open. The latest bar counts as complete only if it is from an earlier session or the provider reports the market closed. An incomplete (or unknown) bar is labelled and is **never** used to confirm a crossover, pattern or breakout.
- Thresholds are the app's own explicit choices, stated beside each reading.

### Evidence groups

| Group | Rule | Data |
| --- | --- | --- |
| **Market trend** (Nifty 50) | Four checks: close above 200-day SMA; 50-day above 200-day; 200-day higher than 20 sessions earlier; weekly close > 10-week EMA > 30-week EMA. *Rising* only if every available check meets its rising condition, *falling* only if every check meets its falling condition, otherwise *mixed*. Needs 220 daily bars. | `^NSEI`, 2 years |
| **Sector trend** | The same four checks on the mapped NSE sector index (table below). | Sector index, 2 years |
| **Stock primary trend** | The same four checks on the stock, plus the latest 50/200 crossover and the latest close crossing the 200-day, each **confirmed after 5 consecutive completed sessions** on the new side. | Stock, 2 years |
| **Relative strength** | Price change over 63, 126 and 252 sessions on dates common to the stock and its comparison indices; difference in percentage points. "Ahead"/"behind" needs a gap above 1 point. Relative line = stock ÷ Nifty compared with its 50-session average. | Stock + indices |
| **Momentum** | 3/6/12-month price change. Volatility-adjusted ratio = 6- or 12-month change ÷ annualised std. dev. of daily log returns over 252 sessions, shown beside the Nifty 50's own ratio. A research-context note appears when the Nifty 50 is below its 200-day SMA and the stock is up over at least one window. | Stock + Nifty |
| **Price & volume structure** | 52-week range position (within 5% of high / within 10% of low / percent of range); 60-session range width; ATR(14)% versus its 1-year median (<0.75× contracting, >1.25× expanding); 50/200-session volume ratio; up-day versus down-day volume over 50 sessions (proxy only). | Stock |
| **Patterns** | Candle formations and indicator events (section 4). | Stock daily + weekly |
| **Fundamentals** | Provider snapshot with source/period labels; growth classified *growing* (both growth fields > +5%), *contracting* (both < −5%) or *mixed*; dated quarterly EPS. | Yahoo summary + earnings module |
| **Events** | Next results date (estimate or not, per provider), flagged when within 56 calendar days (≈ the 40-session hold); latest reported quarter with period end and reported date; any ≥5% opening gap in the last 20 sessions. | Provider calendar |
| **Risk** | Annualised volatility (20/60/252); ATR > 4% flag; max drawdown in 252 sessions (> 30% flag); opening gaps ≥3%/≥5% (three or more ≥5% flag); beta and correlation to Nifty; median traded value (below ₹1 crore thin, ₹1–10 crore moderate, ₹10 crore+ deep); data freshness versus today and versus the index's last bar; results within 10 days. | Stock + Nifty |
| **News** | Section 5. | Google News RSS |

**Conflicts** are deterministic rules, for example: stock rising while the market or sector is falling; a bullish mid-term score while the stricter trend classification is mixed or falling; 3-month and 12-month relative strength pointing opposite ways; a bullish formation inside a falling trend; an active divergence against the trend; results inside the hold window; a rising trend with more volume on down days. **What would change these readings** lists the levels at which the current trend classification would stop holding (200-day SMA, 50-day, weekly EMAs) and the model's illustrative stop — observations, not instructions.

**Gap scenario:** if the stock opened below the mid-term model stop by the largest opening fall of the past year, the loss per share would be that much larger than planned. The report shows the multiple and what it means for a position sized to lose 1% of capital at the stop. It is arithmetic, not a loss limit; a future gap can be larger.

### Sector index mapping

Checked on 22 Nov 2026 that each symbol returned about two years of daily history from Yahoo. Nifty Media, Nifty Commodities, Nifty Healthcare, Nifty Oil & Gas, Nifty Consumer Durables and Nifty Services returned a single bar, so they are not used.

| App sector | Index | Fit |
| --- | --- | --- |
| Financials (provider industry contains "bank") | Nifty Bank `^NSEBANK` | Direct |
| Financials (other) | Nifty Financial Services `NIFTY_FIN_SERVICE.NS` | Direct (approximate if industry unknown) |
| Technology | Nifty IT `^CNXIT` | Direct for IT services/software, else approximate |
| Auto | Nifty Auto `^CNXAUTO` | Direct |
| Pharma | Nifty Pharma `^CNXPHARMA` | Direct for drug makers, approximate for hospitals |
| FMCG | Nifty FMCG `^CNXFMCG` | Direct |
| Metals | Nifty Metal `^CNXMETAL` | Direct |
| Energy | Nifty Energy `^CNXENERGY` | Direct |
| Utilities | Nifty Energy | Approximate |
| Realty | Nifty Realty `^CNXREALTY` | Direct |
| Consumer | Nifty India Consumption `^CNXCONSUM` | Approximate |
| Industrials, Telecom | Nifty Infrastructure `^CNXINFRA` | Approximate |
| Materials, Media | none | No suitable series |

Stocks outside the app universe are mapped from the provider's sector and industry with the same table.

## 4. Candle and indicator rules

**Context.** A formation needs 20 prior bars. *Prior decline*: the close before the formation is below both the close 10 bars earlier and its 20-bar average; *prior advance* is the mirror. Average body and range use the 10 bars before the formation.

| Formation | Rule (all must hold) |
| --- | --- |
| Doji (neutral) | Body ≤ 10% of range; range ≥ 0.5× the 10-bar average range |
| Hammer / hanging man | Body > 10% of range; lower shadow ≥ 2× body; upper shadow ≤ max(10% of range, ½ body). After a decline it is a hammer (bullish), after an advance a hanging man (bearish); with no prior trend it is **not reported** |
| Inverted hammer / shooting star | Mirror of the above with the upper shadow; inverted hammer after a decline, shooting star after an advance |
| Bullish / bearish engulfing | Opposite-colour second body that covers the first body and is larger; after a decline / advance |
| Piercing line / dark cloud cover | Long first body (≥ 10-bar average); second opens beyond the first close and closes past the first body's midpoint without engulfing |
| Bullish / bearish harami | Long first body; second body inside it and at most half its size |
| Morning / evening star | Long first body; small middle body (≤ ½) near or beyond the first close; third closes past the first body's midpoint with a body ≥ ½ the first |
| Three white soldiers / black crows | Three same-colour bodies ≥ 0.8× average, each closing further on and opening inside the previous body, small shadows on the trend side; not after a move in the same direction |

**Confirmation and invalidation.** A bullish formation is *confirmed* if one of the next **3 completed bars** closes above the formation high and *invalidated* if a completed bar closes below the formation low first; otherwise it *expires*. Bearish is the mirror. A doji *resolves* up or down on a close beyond its range. A formation ending on an in-progress bar is *forming* and cannot be confirmed by that bar. Daily scans look at formations ending in the last 10 bars; weekly scans the last 6 weeks. A week counts as complete only when its last session is a completed Friday, so a holiday-shortened week stays incomplete until the next week appears.

**Indicator events** (completed bars only for transitions):

- RSI(14) crossing 50, and +DI/−DI changing order: most recent in the last 20 sessions, confirmed after 3 sessions on the new side.
- Weekly MACD (12, 26, 9) crossing its signal line: most recent in the last 8 completed weeks, confirmed after 2 weeks.
- Close beyond the prior 252-session (or else 63-session) high or low, excluding the breakout bar; volume-confirmed at ≥1.5× the prior 50-session average; follow-through confirmed if the next 3 closes stay beyond the level, failed if any closes back inside.
- RSI divergence: pivots are bars whose high (low) beats the 5 bars on each side, so they are known only 5 bars later. Bearish: the latest pivot high is above the previous one 10–60 sessions earlier while RSI is at least 2 points lower (bullish mirror). Reported if recognised in the last 20 sessions; invalidated by a close beyond the latest pivot.
- Current levels (not signals): RSI band, ADX band (≥25 trending, <20 not trending), Bollinger bandwidth percentile over 252 sessions (≤20th compressed, ≥80th expanded), weekly RSI.

These indicators derive from the same prices and are shown as context, never counted as independent votes. **None of these rules has been tested historically in NIVRA.**

## 5. News

[`news.ts`](../src/lib/news.ts) still uses Google News RSS with 7-day, 30-day and unrestricted tiers, now with:

- A quoted, cleaned company name in the query ("Reliance Industries", not "Reliance Industries Limited").
- **Headline matching:** a headline is kept when it names the company — the cleaned name, the app universe name, a short curated list of headline aliases (for example RIL, SBI, L&T, HUL) or the ticker (matched in capitals only). Headlines sharing only a first word (often a group name such as "Tata") are kept with a "check it refers to this company" label. Others are dropped and **counted**, and the count is shown.
- Separate groups for the **last 7 days**, **older** fallback results and **undated** items. Publisher, publisher domain, publication time in IST, article age and **feed retrieval time** are shown as separate facts.
- Near-identical syndicated headlines are merged; the other outlets are listed.
- Only http(s) links are accepted; headlines are rendered as text; malformed dates no longer throw (previously an invalid `pubDate` could fail a whole tier).
- Links to the NSE quote page (announcements) and BSE corporate announcements for checking material events in filings. Nothing is scraped from the exchanges.
- No summaries and no LLM. The report states that headline timing does not show that news moved the price. A failed refresh keeps the last headlines with a stale label.

## 6. Research map

Ideas are treated as hypotheses. Sources were checked on 22 Nov 2026; where a page could not be retrieved, that is stated.

| Idea | Kind | Source and check | NIVRA's operational version | Horizon fit | Status |
| --- | --- | --- | --- | --- | --- |
| Relative price momentum over 3–12 months | Academic | Jegadeesh & Titman (1993), *J. Finance* 48(1):65–91 — abstract wording ("significant positive returns over 3- to 12-month holding periods") checked via the RePEc listing; the Wiley page refused automated access. US sample, 1965–89 | 3/6/12-month price change and difference versus Nifty 50 and sector index | Good | Descriptive; untested in NIVRA |
| Momentum crash risk | Academic | Daniel & Moskowitz, NBER w20439 (2014; *JFE* 2016) — abstract checked: crashes cluster in "panic" states after market declines with high volatility | Context note when the Nifty 50 is below its 200-day SMA | Good | Context only; untested |
| Volatility-adjusted momentum | Official index methodology | NSE Nifty200 Momentum 30 — 6- and 12-month price returns adjusted for volatility, z-scored across eligible stocks, blended 50/50, semi-annual rebalancing (confirmed via the official factsheet in search results). The official pages timed out, so the exact volatility formula was not read; a secondary source describes it as return ÷ standard deviation of daily returns over a year | Return ÷ annualised daily log-return volatility (252 sessions), single stock, no cross-sectional z-score | Good | Not equivalent to the index; untested |
| Relative strength and earnings growth (CAN SLIM) | Practitioner | William O'Neil + Co. ratings page — checked: RS Rating uses 12-month price change weighted 40% latest quarter and 20% for each earlier quarter, ranked 1–99 | Own transparent windows; no percentile ranking and no proprietary score reproduced | Good | Descriptive only |
| Primary trend / stage context | Practitioner | General practitioner idea; no single source verified | Four-check trend classification with confirmed crosses | Good | Untested |
| Business quality (durable growth, returns on capital) | Practitioner | *Coffee Can Investing* (Mukherjea, Ranjan, Uniyal; Penguin 2018) — publisher listing checked; it states no thresholds | Not used as a signal; fundamentals shown descriptively | Long horizon | Not implemented as a rule |
| Backtest overfitting | Academic | Bailey, Borwein, López de Prado & Zhu, *J. Computational Finance* 20(4), 2017 (SSRN 2326253) — abstract checked via search results; eScholarship returned no content | Informs the validation rules in section 8; PBO is not computed | — | Discipline, not a feature |
| Investor education (due diligence, risk, analysis types, research analysts) | Official | SEBI investor pages named in the brief could not be reached from the research tool (DNS failure) | Not cited in the app | — | Unverified here |

YouTube and trader interviews were not used as evidence. Success stories are subject to survivorship and selection bias; any idea taken from them would need the same point-in-time testing.

## 7. Gap analysis

| Needed for the brief | Status |
| --- | --- |
| Stock, Nifty 50 and sector daily bars | **Available** (Yahoo, delayed) |
| Relative strength, momentum, structure, candles, indicator events, risk metrics | **Implemented** from those bars |
| Total-return indices / dividend-adjusted stock returns | **Not used.** The app's bar contract uses the provider's `close`, which does not add back dividends, and Nifty total-return-index history was not checked; price returns are labelled as such |
| Dated quarterly EPS (period end, reported date) | **Available** from the provider's earnings module, optional |
| Quarterly/annual revenue and profit history | **Rejected for now:** the same provider module returned zero-filled and inconsistent periods for Indian listings in the 22 Nov 2026 check |
| Point-in-time fundamentals, estimates, ownership | **Unavailable** — needs a licensed point-in-time dataset |
| Valuation versus own history and peers | **Unavailable** — needs historical valuation series and a peer set |
| Promoter pledges, shareholding pattern, audit or regulatory flags | **Unavailable** from current sources; would need exchange filings with a permitted access route |
| Exchange announcements | **Linked**, not scraped (terms of use and access were not reviewed) |
| Point-in-time index constituents and delisted securities | **Unavailable** — the study universe is today's list |

## 8. Validation status

### Stored record (measured 2026-07-24, not re-run)

Mid engine: 132 stocks, 67,832 overlapping daily observations, 20-session horizon, correlation −0.1469, net expectancy −0.034R per trade, profit factor 0.97; lowest score bucket +0.754% versus highest −0.075% average forward return. Conclusion: **no demonstrated stable edge**. The negative association does not validate an inverse strategy. Only one window is stored for this engine.

### Re-measured 22 November 2026 (supersedes the record above in the app)

A [pre-registered study](research/mid-engine-study.md) re-ran the same rules on two non-overlapping periods with 95% block-bootstrap intervals:

| | Oct 2024 – Oct 2026 | 2019–2022 (held out) |
| --- | ---: | ---: |
| Correlation (app's measure) | −0.199 [−0.291, −0.135] | −0.049 [−0.141, +0.025] |
| Same measure on shuffled prices | −0.124 | −0.066 |
| Daily rank correlation across stocks | −0.008 [−0.065, +0.050] | +0.001 [−0.043, +0.045] |
| Net expectancy per trade | −0.136R [−0.299, +0.020] | +0.119R [+0.007, +0.227] |

Conclusion unchanged: **no demonstrated edge**. What changed is the explanation of the negative correlation. A within-stock correlation of a trend score reads negative even on shuffled, unpredictable prices, so the earlier "higher scores were followed by lower returns" was mostly a property of the measure. The app now shows both periods, the intervals and the shuffled-price baseline (`src/lib/validation.ts`).

### Discrepancies found while auditing (documented, records unchanged)

1. **"3 years" vs about two years.** The default study fetches three years but spends the first 210 sessions on indicator warm-up. The sample counts confirm it: 67,832 ÷ 132 ≈ 514 per stock ≈ (about 744 sessions − 210 warm-up − 20 horizon). An unused helper said "3 years"; it and the UI now say "about two years of decisions". The short engine's stored "2023–2026" label describes the fetched span; its decisions began roughly ten months later. The label itself is preserved, with an explanatory caption.
2. **Correlation definition.** The stored correlation is the sample-weighted average of per-stock correlations (`pooledCorrelation`), not a correlation over all pooled samples. The comment and UI now say so.
3. **History check engine.** It always replays the short-term rules; the mid and long views now say this.
4. **"Promoter holding".** The field is Yahoo's insider-holding figure, not the exchange shareholding pattern. The new fundamentals section labels it "Held by insiders" with that caveat; the existing long-term panel is unchanged.
5. **News date parsing.** A malformed `pubDate` could throw and fail a whole query tier; fixed.

### The mid-term hypothesis, written down as implemented

Universe: the app's current liquid NSE list with at least 240 sessions. Decision: each session's close using bars up to that close. Entry: next open when the score is ≥ 58 and stop/target are valid; one position per stock. Exit: stop (gaps fill at the open), first target, or 40 sessions; stop first when both are touched. Costs: 0.2% round trip. Signal study: score versus 20-session forward price change on every day (overlapping). Benchmarks: per-stock buy-and-hold over the same window. Not modelled: liquidity limits, market impact, spreads beyond the cost assumption, a capital-constrained portfolio.

### What testing the new evidence honestly would require

The current simulator replays one stock at a time on today's universe, so it cannot test a cross-sectional idea such as "stocks ahead of their sector" without survivorship bias. A sound test would need: a point-in-time universe including delisted names; total-return benchmarks; pre-registered rules with separate development, validation and untouched holdout periods; a record of every variant tried (multiple-testing / backtest-overfitting risk); ablations showing whether each group adds anything beyond the existing score; cost and parameter sensitivity; and regime and non-overlapping-window breakdowns. None of that was run for the evidence brief. If it is, failed results should be published alongside successes, as the existing short-engine record already does.

For the mid-term **score** (not the evidence brief), the 22 November 2026 study did cover pre-registration, a held-out period, per-input ablations, regime and non-overlapping breakdowns, and a measured (not corrected) survivorship gap. It still lacks a point-in-time universe, total-return data, and cost and parameter sensitivity.

## 9. Explaining it simply

- **Observation:** a computed fact with a date ("close is 9.2% above its 200-day average as of 20 Nov").
- **Interpretation:** what a stated rule says about it ("all four rising checks are met, so the trend is classified as rising").
- **Validation:** what the exact rules did in a stored historical test (for the mid score: no stable edge).
- **Confidence:** agreement and trend clarity of the score's own inputs — never a probability of profit.

A rising trend, strong relative strength and a confirmed candle formation can all appear together and still precede a loss. The app shows them so the setup and its risks are visible, not to predict the outcome. Paid or personalised recommendations in India fall under SEBI's research-analyst rules; any commercial use of this app would need qualified regulatory review.
