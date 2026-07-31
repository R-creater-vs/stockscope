# StockScope

Swing-trading analysis for Indian stocks (NSE & BSE). Type a company name or ticker; get eight
weighted technical checks, key levels, and a risk-defined trade plan for a days-to-weeks holding
period.

**Educational tool, not investment advice.** See the disclaimer at the bottom of every report.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run verify` | Validates the indicator math against independent references (**dev server must be running**) |
| `npm run backtest` | Runs the universe backtest study and prints the honest result (**dev server must be running**) |

---

## No API keys required

Everything runs on free, keyless sources: Yahoo Finance (prices/fundamentals), Google News RSS
(headlines), and an optional **local** Ollama model for AI-written prose. Watchlists, alerts and
push notifications are all self-hosted (embedded SQLite + self-generated VAPID keys — see
[Accounts, persistence & alerts](#accounts-persistence--alerts)). The only feature that would ever
need a key is the *optional* real-time broker feed — it stays dormant, and the app is fully
functional without it.

## Features

- **Suggestions** — scans ~130 liquid NSE stocks (~3s, cached 15 min) into six actionable buckets:
  best setups, running strong, breaking out, buy-the-dip, coiled up (squeeze), oversold bounce.
- **Price filter** — narrow the suggestions to a price band (presets or a custom min/max). Filtering
  and re-bucketing happen in the browser from the already-loaded data, so it is instant — no
  server round-trip.
- **Market regime banner** — Nifty 50 trend (bullish / neutral / bearish). Long setups fail more
  often against a falling index; this sits above everything for that reason.
- **Sector rotation** — average setup strength per sector. A strong sector in a weak market is
  where money is rotating — the tell a stock-by-stock list buries.
- **Full report** — verdict, weekly-timeframe confirmation, chart, ATR trade plan with position
  sizing, risk flags, signal breakdown, news, analyst consensus, fundamentals.
- **Weekly confirmation** — the daily setup checked against the weekly trend (derived from the same
  data, no extra fetch). Agreement raises confidence; conflict lowers it.
- **Earnings awareness** — next results date shown on every report, and flagged as a gap risk when
  within 10 days.
- **News** — per-stock headlines via Google News RSS, as leads to verify.
- **Watchlist** — star any stock; a live-scored watchlist tab. Persisted server-side per device
  (embedded SQLite), so it survives a cache clear.
- **Price alerts** — per-stock rules (breakout, breaks-stop, score threshold, daily move %) checked
  on the server every 15 min and delivered as **push notifications** — even with the tab closed.

## Performance

The UI is built to stay responsive:

- **Instant filtering.** The pure screener aggregation (bucketing, sector rotation) lives in
  `src/lib/screenAggregate.ts` with no server dependencies, so the browser re-buckets on a price
  change without hitting the server.
- **No wasted re-renders.** Card grids, star buttons and the sector heatmap are `React.memo`d, and
  derived lists are `useMemo`d — toggling a star or a price band updates only what changed, not the
  whole grid.
- **Cached hot paths.** The universe scan (15 min), single-stock backtest (30 min) and the full
  study (12 h) are cached with in-flight guards, so concurrent viewers share one computation.

## How it works

```text
data providers ──▶ src/lib/providers/    the data seam (Yahoo default; broker-swappable)
                        │
                        ▼
                  src/lib/indicators.ts  pure math: EMA, RSI, MACD, ATR, ADX, Bollinger, pivots,
                        │                 weekly resampling
                        ▼
                  src/lib/swing.ts       8 weighted signals + weekly → score → verdict → plan
                        │
                  src/lib/screener.ts    universe scan → buckets + sector rotation
                        │
                        ▼
                  src/lib/narrative.ts   prose (rule-based, or a local LLM if one is running)
                        │
                        ▼
                  /api/{analyze,screen,news,watch,search}   JSON
                        │
                        ▼
                  src/app/page.tsx       dashboard (suggestions · watchlist · report)
```

### The one architectural rule

**Every number the user sees is computed in `swing.ts`. The language model never calculates
anything.** It receives the finished figures and is asked only to explain them. A hallucinated RSI
is worse than no RSI, so the LLM is structurally prevented from producing one. If the model is
unavailable, unreachable, or returns junk, the app silently falls back to rule-based prose and
loses nothing but style.

### The eight signals

| Signal | Category | Weight |
| --- | --- | ---: |
| Price vs 20/50 EMA | Trend | 18 |
| 20/50 EMA alignment | Trend | 12 |
| Trend strength (ADX + DI) | Trend | 12 |
| RSI (14) | Momentum | 14 |
| MACD histogram (level *and* slope) | Momentum | 14 |
| Volume vs 20-day average | Volume | 12 |
| Bollinger position / squeeze | Volatility | 8 |
| 20-day range position & breakout | Structure | 10 |

Each scores −1 (strongly bearish) to +1 (strongly bullish), weighted into a 0–100 score:

- **≥ 72** — STRONG BUY
- **58–71** — BUY
- **40–57** — HOLD
- **< 40** — AVOID

### Score vs confidence

These are independent, and the distinction matters.

**Score** answers *"which direction do the signals point?"*
**Confidence** answers *"how much should I trust that?"* — derived from how much the signals agree
with each other and how cleanly the stock is trending (ADX).

A stock can score 70 (BUY) at 36% confidence: nominally bullish, but the signals contradict each
other and ADX says the tape is chopping. That is a real and common state, and hiding it behind a
single number would be the most dangerous thing this app could do.

### Trade plan

Stops and targets are ATR-derived, not round numbers:

- **Stop** — the further of 1.5×ATR below price, or just under the nearest pivot support. A stop
  inside the average daily range is a stop that gets hit by noise alone.
- **Target 1** — nearest pivot resistance, capped at 2×ATR.
- **Target 2** — 3.5×ATR.
- **Position size** — shares such that hitting the stop costs exactly your chosen % of capital.

---

## Known data limitations

These are Yahoo's, not the code's, and the app degrades gracefully around each:

- **BSE (`.BO`) series are frequently broken.** `RELIANCE.BO` returns 5 usable rows where
  `RELIANCE.NS` returns 500. The app detects this and automatically re-fetches the NSE listing.
- **Numeric BSE scrip codes** (e.g. `500325.BO`) fail Yahoo's own schema validation. Use the name
  or the alphabetic ticker.
- **Fundamentals are sparse for Indian listings.** ROE and current ratio are often missing even for
  large caps. Every field is nullable and renders as `—`. Fundamentals are context only — they do
  not feed the swing score.
- **Prices are delayed ~15 min.** Yahoo is not a real-time feed — which is fine for swing trading;
  see [Data & why there's no real-time feed](#data--why-theres-no-real-time-feed) below.
- **Post-demerger tickers are ambiguous.** "tata motors" resolves to `TMCV.NS`; use the
  autocomplete dropdown to pick the exact listing you mean.

---

## Data & why there's no real-time feed

Everything runs on Yahoo Finance (free), delayed ~15 minutes. That is deliberate, not a limitation:
this app is for **weeks-to-weeks swing trading** on **daily bars**, where a 15-minute (or even
end-of-day) delay changes nothing. Tick-by-tick real-time only matters to intraday scalpers, so a
broker feed would add cost and complexity for zero benefit here.

The data layer still sits behind a `DataProvider` interface in
[`src/lib/providers/`](src/lib/providers/), so swapping Yahoo out later is a one-file change — but by
design there is nothing to configure and no key to obtain.

---

## Optional: AI-written analysis

The app works fully without this. To upgrade the prose from rule-based to model-written:

```bash
# install Ollama from https://ollama.com, then:
ollama pull qwen2.5:7b
```

That's it — the app detects a running Ollama on `127.0.0.1:11434` and uses it automatically,
falling back the moment it isn't there. Override with `OLLAMA_URL` / `OLLAMA_MODEL` env vars.

A 7B model fits a 4 GB GPU at Q4 with some spill to system RAM. The report header shows whether
any given narrative was **AI written** or **Rule based**.

---

## Verifying the math

`npm run verify` checks the indicator engine against independent references rather than trusting
it: our SMA-50/200 against Yahoo's own published averages, and RSI/EMA/ATR against from-scratch
implementations. It also confirms the published score is reproducible from the published signal
weights, and that the trade plan is internally consistent (stop below price, targets ordered,
risk:reward arithmetic correct).

Current status: all checks pass — RSI/EMA/ATR to 0.000%, SMA-50 to 0.003% of Yahoo's figure.

---

## Backtesting — and an honest finding

The **Strategy check** tab (and `npm run backtest`) replays the engine over history to answer the
only question that matters: does the score actually predict anything? The backtest is built to be
hard to fool —

- **No look-ahead.** On decision day `t` the engine sees only `bars[0..t]`, exactly what a trader
  had at that close.
- **Realistic fills.** Entries at the *next* day's open; a gap through a level fills at the open,
  not the level; when both stop and target are touched intraday, the stop is assumed first.
- **Costs included.** ~0.2% round-trip (STT, charges, slippage). Zero-cost backtests lie.
- **Two studies.** A *signal study* (score vs realised forward return, bucketed) that isolates
  predictive power, and a *trade study* (win rate, expectancy, profit factor, drawdown).

**The result, across ~128 NSE stocks and ~66,000 samples (2023–2026):**

> The engine, as currently weighted, has **no edge**. The score's correlation with 10-day forward
> return is **−0.07** — essentially zero, and if anything slightly *contrarian*: the lowest-score
> (`<40`) bucket averaged **+0.40%** forward while the top (`72+`) bucket averaged **−0.07%**. The
> long-only trade strategy runs a **negative expectancy** (≈ −0.02R per trade, profit factor 0.80),
> and the standard "only long when Nifty is in an uptrend" filter did **not** fix it.

This is the backtest doing its job. A momentum-scoring engine that *looks* authoritative is worth
nothing if it doesn't predict returns, and now we know this one doesn't — on this universe and
period. The honest next steps (each a hypothesis to test out-of-sample, **not** a tweak to overfit
until the number turns green):

1. The signal is mildly *mean-reverting*, so a contrarian variant (favouring oversold, low-score
   setups) is the obvious thing to test next.
2. The exit model (tight ATR stops, stop-first pessimism) yields a ~48% win rate with losers larger
   than winners — wider or trailing stops are worth a study.
3. Everything here is in-sample. Any promising variant must be validated on a held-out period
   before it means anything.

The app shows this finding rather than hiding it, because a tool that lies about its own edge is
worse than no tool.

---

## Accounts, persistence & alerts

The app now persists data server-side and can send real push notifications.

- **Storage** — an embedded SQLite database (Node's built-in `node:sqlite`, no native build, no
  external server) at `.data/stockscope.db`. Override the location with `STOCKSCOPE_DB_PATH`.
- **Identity** — every browser gets an anonymous id via a signed cookie (see `src/middleware.ts`)
  the moment it arrives, so a watchlist and alerts work with zero friction. Sign in with Google
  (below) to upgrade that into a real account whose data follows you across devices.
- **Watchlist** — stored in the DB keyed by that id (`/api/watchlist`), not localStorage, so it
  survives a cache clear and is visible server-side.
- **Alerts** — per-stock rules (breakout, breaks-stop, score threshold, daily move %) set from a
  stock's report or the Alerts tab. The **scheduler** (`src/lib/scheduler.ts`, started from
  `src/instrumentation.ts`) re-scans every watched stock every 15 minutes and fires matching rules.
  A 6-hour per-alert cooldown prevents repeat spam.
- **Web Push** — real notifications that arrive with the tab closed, via the browser's own push
  service. VAPID keys are generated on first run into `.data/vapid.json` (pin them in production
  with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). No push provider account is required.
- **Live-ish quotes** — the report price auto-refreshes every 60s from `/api/quote`. Still
  Yahoo-**delayed** (labelled as such); true real-time needs a broker feed (below).

## Signing in with Google

Real Google sign-in is built in — no NextAuth, no third-party auth service. Sessions are a compact
payload signed with HMAC-SHA256 using a secret generated on first run into `.data/auth.json` (pin it
with `AUTH_SECRET` in production), mirroring how the VAPID keys work.

The one thing that genuinely requires setup is the OAuth client — only Google can mint those
credentials. Until they're set, the app runs exactly as before on anonymous per-device identity, and
the sign-in button shows these same steps.

1. Open <https://console.cloud.google.com/apis/credentials>.
2. **Create Credentials → OAuth client ID → Web application.**
3. Under **Authorised redirect URIs** add (dev): `http://localhost:3000/api/auth/callback/google`
   — and your production URL, e.g. `https://yourdomain/api/auth/callback/google`.
4. Copy the client ID and secret into `.env.local`:

   ```bash
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   ```

5. Restart the dev server and click **Sign in → Continue with Google**.

What you get: the session cookie identifies the account (`google:<sub>`), so your watchlist, alerts
and push subscriptions follow you across devices. Signing in on a device also **carries over** the
anonymous watchlist and alerts it already had. Sign-out drops the session and the browser falls back
to its anonymous identity. Only `openid email profile` scopes are requested; the profile lives in
the `users` table and nothing is shared with anyone.

## Deploying

The app builds to a self-contained server (`output: "standalone"`).

```bash
docker build -t stockscope .
docker run -p 3000:3000 -v stockscope-data:/data stockscope
```

The `-v` volume keeps the SQLite DB and VAPID keys across redeploys. Copy `.env.example` to
`.env.local` (dev) or set the same variables in your host to configure paths, VAPID keys and the
alert interval. Web Push requires the site to be served over HTTPS in production (localhost is
exempt).

## The "Price today" chart

Every stock report has a **Price today** chart: the latest session's real intraday line (5-minute
bars), polled from `/api/intraday` and refreshed every minute (paused while the tab is hidden, and
refreshed the instant the app returns to the foreground). The data is real, Yahoo-delayed ~15 min,
and labelled as such — no broker feed, nothing simulated.

The whole report auto-updates too: while a stock is open, price, chart, news and analysis silently
re-pull every few minutes and on refocus, so a report left open (or reopened on your phone after an
alert) is never stale.

> The daily **Price action** chart below it is Yahoo end-of-day data — the historical context; the
> "Price today" chart is the intraday view of the current session.
