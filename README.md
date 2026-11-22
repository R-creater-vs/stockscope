# NIVRA (provisional brand)

The frontend has been redesigned as NIVRA. This name is not cleared for adoption: see [brand and naming checks](docs/brand.md), [repository audit](docs/audit.md), [design system and responsive views](docs/design-system.md), [screenshot gallery](docs/screenshots.md), and [verification report](docs/verification.md). Internal persistence paths and environment variables retain their existing names.

**Understand the setup. See the risk. Decide with clarity.**

The [search and loading update](docs/search-and-loading.md) simplifies stock lookup, adds elapsed-time/cancel/retry controls, and makes history checks easier to find without blocking other searches.

The [mid-term engine study](docs/research/mid-engine-study.md) tests whether the weeks-to-months score predicts returns, under a [plan fixed in advance](docs/research/mid-engine-preregistration.md): two separate periods, 95% intervals, a shuffled-price baseline, per-input analysis, and measured survivorship and data-quality limits. Result: no demonstrated edge. Reproduce it with `node scripts/research/engine-study.mjs --engine mid --window recent --null 3` (and `--window 2019-2022`).

The [weeks-to-months analysis](docs/weeks-to-months.md) adds a descriptive evidence brief to the mid-term (position) view: market and sector trend, relative strength, dated candle and indicator events, fundamentals context, attributed news and position risks, each with its rule and source date. It does not change the mid-term score and has not been historically tested.

A research and decision-support app for Indian stocks. Search NSE/BSE listings, inspect eight
weighted swing signals, compare timeframes, review model risk levels, and monitor saved stocks.
The configured scan universe contains **165 NSE equities**; individual lookup also supports BSE,
subject to Yahoo coverage.

**Educational tool, not investment advice.** The weighted swing score has no demonstrated stable
trading edge. Confidence describes agreement and trend clarity, never a probability of profit.
These limitations appear beside the relevant readings, with a fuller report disclaimer.

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
| `npm run build:termux` | Android/Termux production build using Webpack because Turbopack native bindings are unavailable there |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Rule tests for the candle-pattern, indicator-event, bar-completion and sector-benchmark logic (synthetic fixtures; no server or network) |
| `npm run verify` | Validates the indicator math against independent references (**dev server must be running**) |
| `npm run verify:math` | Checks frozen pre-redesign numerical regression cases; no running server or market network request needed |
| `npm run verify:ui` | Runs Chrome/CDP layout, accessibility and interaction checks against a local server with an **isolated verification database** |
| `npm run verify:bundle` | Run after `npm run build`, before starting the standalone server; checks that local `.data` and `.env*` files were not packaged |
| `npm run backtest` | Runs the universe backtest study and prints the honest result (**dev server must be running**) |

The browser check creates/removes watchlist and alert records for its test identity. Run it only
against a dedicated local verification server, never a personal or production database. For example,
start the server from a separate PowerShell terminal:

```powershell
$env:STOCKSCOPE_DB_PATH = '.data/nivra-verification.db'
$env:STOCKSCOPE_AUTH_PATH = '.data/nivra-verification-auth.json'
$env:STOCKSCOPE_VAPID_PATH = '.data/nivra-verification-vapid.json'
npm run dev
```

Then run `npm run verify:ui` from another terminal. It defaults to `http://localhost:3000`; pass
another local port with `npm run verify:ui -- http://localhost:3001`. Chrome must be installed;
set `CHROME_PATH` if its executable is elsewhere. The script uses the repository's available
`axe-core`, writes [browser observations](docs/browser-verification.json) and updates the
[screenshot gallery](docs/screenshots.md). It does not subscribe to push notifications. Use a
production build/server for representative bundle and performance observations. Reported local
timings are not performance guarantees for other devices or network conditions.

---

## Data sources and optional services

Market research uses Yahoo Finance and Google News RSS without application API keys. Weeks-to-months
comparisons also read Nifty 50 and NSE sector-index history and dated quarterly EPS from Yahoo;
see the [sector index mapping](docs/weeks-to-months.md#sector-index-mapping). Optional
Ollama prose runs locally. Watchlists and alerts use embedded SQLite; browser push uses
self-generated VAPID keys. See [Accounts, persistence & alerts](#accounts-persistence--alerts).
Google sign-in requires OAuth credentials. The repository contains a broker-provider template,
but no broker integration or order execution is connected.

## Six views

- **Market overview** — Nifty regime, provider market status, source daily-bar date, sector
  technical scores and a short list meeting fixed setup rules. Sector scores describe scanned
  stocks' rule readings; they do not measure money flows or establish sector outperformance.
- **Discover** — search, sector/setup/price filters, sortable rows, setup explanations and scan
  coverage/freshness. The historical ranking remains available as research context, with sample
  size and expectancy beside win rate. It is not a list of validated opportunities.
- **Stock intelligence report** — company/exchange, price, timeframe, descriptive verdict, score,
  confidence and validation status; then price action, grouped weighted contributions, model
  trade plan, sizing, risks, news and deeper research. Weekly agreement and available earnings
  dates add context. Sparse fundamentals and analyst coverage remain explicitly unavailable.
  The **Mid-term · weeks to months** view adds the
  [weeks-to-months evidence brief](docs/weeks-to-months.md): Nifty 50 and sector-index trend,
  stock trend checks with confirmed crossovers, 3/6/12-month relative strength, structure,
  candle and indicator events with confirmation rules, fundamentals with source labels, events,
  news, risk arithmetic, conflicts and the engine's stored historical status. The chosen
  timeframe is remembered in the browser.
- **Watchlist** — server-persisted saved stocks, refreshed scores, changes since the previous
  in-session reading, alert state and a route back to reports. Anonymous access depends on the
  browser identity cookie; deleting it can lose access to those saved records.
- **Alerts** — rule creation with a condition preview, stored rules, optional browser delivery,
  manual checking and event history. The server evaluates daily-bar conditions every 15 minutes
  by default, while running, with a six-hour per-rule cooldown. Delivery is conditional on
  permission, subscription, browser/device settings and connectivity.
- **Strategy evidence** — recorded no-edge finding, sample counts, costs and limitations available
  immediately; optional historical study runs for short, mid and the long-term price proxy.
  Historical comparisons do not establish a prospective trading edge.

## Performance

- **Local filtering.** `src/lib/screenAggregate.ts` has no server dependencies. Filtering and
  re-bucketing use already-loaded rows without another source request. Lists reveal rows in
  batches, and expensive derived values are memoized where useful.
- **On-demand detail.** Charts and report modules load when needed; intraday context and deeper
  research use disclosure. Reduced-motion preferences disable decorative motion.
- **Caches with visible age.** The scan has a 15-minute freshness threshold and can serve a
  persisted older snapshot while refreshing. The full study cache lasts 12 hours. Single-stock
  backtests use a 20-hour disk freshness check; a completed in-memory job is retained for the
  process lifetime. In-flight guards share expensive work. Request/scan speed depends on source
  availability, cached data, machine and network; it is not fixed at a few seconds.
- **Bounded refresh.** Foreground refreshes reuse existing contracts and retain prior values on
  failure. A successful retrieval does not establish that the source quote is current.

## How it works

```text
data providers ──▶ src/lib/providers/    the data seam (Yahoo default; broker-swappable)
                        │
                        ▼
                  src/lib/indicators.ts  pure math: EMA, RSI, MACD, ATR, ADX, Bollinger, pivots,
                        │                 weekly resampling
                        ▼
                  src/lib/swing.ts       8 weighted signals + weekly → score → verdict → plan
                  src/lib/midterm.ts     weeks-to-months score (rules shown from midRules.ts)
                  src/lib/positionEvidence.ts  descriptive weeks-to-months evidence (not a score input),
                        │                 with candlePatterns.ts, indicatorEvents.ts, sectorBenchmarks.ts
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
                  src/app/page.tsx       six-view workspace and stock report
```

### The one architectural rule

**Displayed financial figures come from provider data and deterministic code, never from a
language model.** `swing.ts` computes short-term analysis; separate modules compute other
timeframes, backtests and sizing. Optional AI prose receives completed inputs and is labeled.
Detected numerical AI prose is rejected in favor of the deterministic template. This guard is
not a guarantee that qualitative model statements are correct; the model cannot alter the
structured figures, scores or plans.

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

- **≥ 72** — strong bullish direction (internal `STRONG_BUY`)
- **58–71** — bullish direction (internal `BUY`)
- **40–57** — mixed direction (internal `HOLD`)
- **< 40** — bearish direction (internal `AVOID`)

These are descriptions of rules, not trade recommendations. Internal enums remain unchanged.

### Score vs confidence

**Score** answers *"which direction do the signals point?"*
**Confidence** describes agreement among the signals and trend clarity (ADX), with weekly
adjustment in the swing engine. It is a separate rule metric on a 0–100 scale, **not a probability
of profit** or an assurance that a trade is reliable. A bullish score can coexist with low
agreement. Long-term confidence also depends on available fundamental inputs.

### Trade plan

The short-term engine derives illustrative risk levels from ATR and pivot structure:

- **Stop** — the further of 1.5×ATR below price or just under the nearest pivot support.
- **Target 1** — nearest pivot resistance, capped at 2×ATR.
- **Target 2** — 3.5×ATR.
- **Position size** — whole shares computed from capital, chosen risk percentage and model risk
  per share. This arithmetic does not guarantee a loss limit: gaps, slippage, costs and execution
  can produce a larger loss. No order is placed by the app.

---

## Known data limitations

Source coverage and the current implementation impose limits:

- **BSE (`.BO`) history can be incomplete.** When fewer than 60 usable bars are returned, the app
  tries the matching NSE ticker and identifies the listing switch. It cannot guarantee coverage
  or an equivalent listing for every BSE code.
- **Numeric BSE scrip codes** (e.g. `500325.BO`) can fail Yahoo/library validation. Use search to
  inspect available named listings.
- **Fundamentals are sparse for Indian listings.** ROE and current ratio are often missing even for
  large caps. Every field is nullable and renders as `—`. Fundamentals feed the long-term model,
  but do not feed the short-term swing score.
- **Prices are delayed.** A fresh request may still return an old quote. Retrieval/analysis
  timestamps are not exchange observation timestamps. See [Data freshness](#data-freshness).
- **Company names can resolve ambiguously**, especially after corporate actions. Pick the exact
  company and exchange in autocomplete and check the resolved report identity.
- **News and earnings are incomplete context.** Headlines are leads to verify; earnings dates can
  be missing or estimated. Neither source guarantees that all material events are known. Headlines
  that do not name the company are hidden and counted; exchange filings remain the primary source.
- **Comparisons are price returns.** Dividends are excluded for stocks and indices. Some sector
  indices are approximate matches, and several NSE indices have no provider history.
- **Provider revenue/profit history is not used.** In a 22 Nov 2026 check it contained zero-filled
  and inconsistent periods for Indian listings; only dated quarterly EPS is shown.

---

## Data freshness

Yahoo Finance is the active provider and is explicitly marked non-real-time. Delay varies;
refreshing quotes every minute does not remove it. Daily bars drive the technical rules. Source
bar dates, intraday point times, scan computation times and browser retrieval times describe
different things and are labeled separately. The quote contract does not expose an exchange
observation timestamp, so the app does not invent one. Check current executable prices elsewhere
before making a trading decision.

The [`DataProvider` interface](src/lib/providers/provider.ts) is a seam for a future provider.
The broker example is not wired in; adding a feed would require implementation, credentials and
validation. This redesign does not add a real-time feed.

---

## Optional: AI-written analysis

Deterministic research works without a language model. To enable optional model-written prose:

```bash
# install Ollama from https://ollama.com, then:
ollama pull qwen2.5:7b
```

The narrative builder tries Ollama at `127.0.0.1:11434`, with a deterministic fallback if the
request fails or output fails its acceptance checks. Override with `OLLAMA_URL` / `OLLAMA_MODEL`.
Hardware requirements and response time depend on model, quantization and runtime configuration.
The report labels any displayed narrative as **AI written** or **Rule based**. AI is restricted to
qualitative explanation and never supplies the product's financial figures.

---

## Verifying the math

`npm run verify` checks the indicator engine against independent references rather than trusting
it: our SMA-50/200 against Yahoo's own published averages, and RSI/EMA/ATR against from-scratch
implementations. It also confirms the published score is reproducible from the published signal
weights, and that the trade plan is internally consistent (stop below price, targets ordered,
risk:reward arithmetic correct).

`npm run verify:math` independently checks the redesign against frozen numerical regression
cases without fetching market data. A passing regression check shows unchanged tested arithmetic,
not a profitable strategy. Current checks, observed results and limitations are recorded in the
[verification report](docs/verification.md); source-dependent comparisons can change on later runs.

---

## Backtesting — and an honest finding

**Strategy evidence** shows the existing recorded findings immediately and offers an optional
universe replay. `npm run backtest` invokes the same study endpoint.

- **Past-only decision inputs.** On decision day `t`, price rules see only `bars[0..t]`.
- **Simulated fills.** Entries use the next session's open; gaps use the open; when a daily bar
  touches both stop and target, the stop is assumed first. These are assumptions, not executable fills.
- **Assumed costs.** A default 0.2% round-trip charge is deducted from simulated trades. Actual
  brokerage, taxes, liquidity and slippage can differ.
- **Two analyses.** Signal buckets compare score with subsequent price returns; trade metrics
  summarize simulated wins, expectancy, profit factor and drawdown. Forward-return observations
  overlap and are not independent trades.

The stored short-term record in [`validation.ts`](src/lib/validation.ts), measured **2026-07-24**,
contains **128 stocks and 67,056 signal observations**: score/10-day-return correlation **−0.0717**,
net expectancy **−0.021R per trade**, and profit factor **0.80**. These are inherited study records,
not new results produced by the redesign. An earlier comparison window behaved differently.
The conclusion remains **no demonstrated stable edge**. Negative historical correlation does not
validate a profitable inverse strategy.

The chosen current universe introduces survivorship/selection concerns. Historical comparisons
are not prospective untouched tests; the stored record lacks uncertainty intervals and full
per-stock output. The long-term study tests a price-only proxy because point-in-time historical
fundamentals are unavailable; it does not validate the actual fundamental model. Single-stock
backtests use available history since listing, while lightweight scanner histories are shorter
and can contain very small trade samples. A favorable historical row is research context only.

---

## Accounts, persistence & alerts

The app now persists data server-side and can send real push notifications.

- **Storage** — an embedded SQLite database (Node's built-in `node:sqlite`, no native build, no
  external server) at `.data/stockscope.db`. Override the location with `STOCKSCOPE_DB_PATH`.
- **Identity** — every browser receives an anonymous `sid` cookie via `src/proxy.ts`, allowing
  monitoring without sign-in. It is distinct from the signed account session described below.
  Google sign-in connects monitoring data to an account for access across devices.
- **Watchlist** — stored in SQLite by identity (`/api/watchlist`), not localStorage. Clearing only
  the browser cache does not delete server records, but deleting the identity cookie can prevent
  an anonymous browser from accessing its previous list. Account recovery requires signing in.
- **Alerts** — per-stock daily-bar conditions set from a stock report and reviewed in Alerts.
  The scheduler (`src/lib/scheduler.ts`, started from `src/instrumentation.ts`) runs every
  **15 minutes by default**, configurable with `ALERT_INTERVAL_MS`, while the server process is
  running. A **six-hour per-rule cooldown** limits repeated notifications. Score rules test a
  level, not a recorded crossing; the stop condition uses a recalculated current stop, not a saved
  entry stop. It is not a protective order and may not trigger as a saved-stop monitor would.
- **Web Push** — can deliver with the tab closed when browser permission, an active subscription,
  device settings, connectivity and server operation allow it. Receipt is not guaranteed. VAPID
  keys are generated into `.data/vapid.json` (pin them in production with `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY`). No push provider account is required. Rules/event history work without push.
- **Quote checks** — report quotes are requested every 60 seconds while visible, and on return to
  the foreground. They remain Yahoo-delayed. Failed refreshes retain prior values with a warning.

## Signing in with Google

Real Google sign-in is built in — no NextAuth, no third-party auth service. Sessions are a compact
payload signed with HMAC-SHA256 using a secret generated on first run into `.data/auth.json` (pin it
with `AUTH_SECRET` in production), mirroring how the VAPID keys work.

Google sign-in requires an OAuth client. Until it is configured, anonymous monitoring remains
available and the account menu explains that sign-in is unavailable on this deployment.

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

The signed session identifies the account (`google:<sub>`), allowing saved watchlists and rules to
be accessed across signed-in devices. Signing in also carries over the anonymous monitoring data
already held by that browser. Push subscriptions remain browser/device-specific and need permission
on each device. Sign-out drops the account session and returns the browser to its anonymous identity.
Only `openid email profile` scopes are requested; profile data is stored in the `users` table.
Google handles authentication, and notification payloads travel through browser push services.

## Deploying

The app builds to a self-contained server (`output: "standalone"`). Check the artifact before
starting it, so runtime-created data cannot be mistaken for files included during the build:

```bash
npm run build
npm run verify:bundle
```

Build tracing excludes local runtime data and environment files. Keep database, authentication and
VAPID paths configured at runtime; their existing variable names and persistence behavior are
unchanged. `node scripts/verify-server.mjs standalone` runs a read-only HTTP smoke check against
`http://127.0.0.1:3000`; start that server with isolated DB/auth/VAPID paths as described above.
The [recorded standalone check](docs/server-verification.json) received HTTP 200 for all 12 tested
pages, assets and API responses. It does not test browser push delivery.

```bash
docker build -t stockscope .
docker run -p 3000:3000 -v stockscope-data:/data stockscope
```

The `-v` volume keeps the SQLite DB and VAPID keys across redeploys. Copy `.env.example` to
`.env.local` (dev) or set the same variables in your host to configure paths, VAPID keys and the
alert interval. Web Push requires the site to be served over HTTPS in production (localhost is
exempt).

## Price charts and refresh

**Price action** shows daily bars and computed EMA/model levels. **Intraday context**, initially
collapsed, shows the latest available session's five-minute Yahoo observations. That session may
be an earlier trading day over weekends, holidays or source outages. The chart labels the supplied
session and last observation time; it does not fabricate movement.

When mounted, intraday context requests data every minute while visible and on foreground return.
The full report refreshes every three minutes while visible and on foreground return. Source delay,
cache age and network failure can still leave readings stale; a refresh schedule is not a freshness
guarantee. Previous values are retained with an explanatory warning when a refresh fails.

The loaded app reports offline status. Its service worker supplies an explicit offline page if a
navigation fails; financial API responses are not cached for offline use. Reconnect to retrieve
research, and inspect its source timestamps before relying on it.
