# NIVRA redesign verification

The later [search and loading verification](search-and-loading.md) covers the simplified search/report workflow, request deadlines and responsive history calculations. Browser records and screenshots have been refreshed for that follow-up; the standalone and external-reference observations below also retain the original redesign history.

The final frontend build, lint, typecheck, frozen math regression and browser suite passed. **The live external-reference indicator suite remains failing on one SMA200 comparison.** This report does not establish complete WCAG conformance, production performance, a profitable strategy or name clearance.

> **Update, 22 November 2026:** the SMA200 failure was investigated. The failing comparison never exercised app code, and Yahoo's published average could not be reproduced from Yahoo's own closes. The check now tests the app's SMA200 directly and passes; the Yahoo comparison is still printed as a diagnostic. See [the follow-up](#follow-up-22-november-2026). The record below is unchanged.

See the [repository audit](audit.md), [design system](design-system.md), [brand record](brand.md) and [six-view screenshot gallery](screenshots.md).

## Final checks

| Check | Result |
| --- | --- |
| `npm.cmd run build` | Clean standalone build exited 0 with no NFT/file-tracing warning. Node's experimental SQLite warning remains. |
| `npm.cmd run lint` | Exit 0. |
| `npm.cmd run typecheck` | Exit 0. |
| `npm.cmd run verify:math` | Exit 0; all 18 frozen scenarios passed. |
| `npm.cmd run verify:ui` | Exit 0; 12 layout/accessibility checks, three additional report widths and 14 interaction assertions passed. |
| `npm.cmd run verify:bundle` | Passed: standalone server exists; no local `.data` directory or `.env` files packaged. |
| `node scripts/verify-server.mjs standalone` | Passed all 12 local standalone HTTP smoke checks. |
| Whitespace/diff check | Passed using `git -c core.autocrlf=false -c core.whitespace=trailing-space,space-before-tab,cr-at-eol diff --check`. |
| `npm.cmd run verify` | Exit 1; SMA200 reference difference exceeded tolerance. All other ten checks passed. |

Browser verification used the production build through `next start`, a local isolated database and a test browser identity. Source/API smoke checks returned **165 scanned stocks** using actual Yahoo responses. No invented prices, scores or returns were inserted. Standalone packaging was then rebuilt and smoke-tested separately as described below; no container or production deployment was exercised.

## Standalone packaging and server smoke test

Inspection found that the initial dynamic filesystem trace had copied local runtime data into generated standalone output. This was corrected before delivery: `outputFileTracingExcludes` excludes `.data` and `.env` files, and Turbopack ignore annotations keep runtime path resolution and filesystem calls out of static tracing. The annotations do not change database, auth or VAPID paths or runtime behavior. Original local data remained intact; only generated `.next/standalone` output was removed for the clean rebuild.

The fresh artifact contained `.next`, `node_modules`, `package.json` and `server.js`, without local `.data` or `.env` entries. The permanent [bundle check](../scripts/verify-build-output.mjs), run through `npm.cmd run verify:bundle`, passed. The clean build no longer emitted the previous NFT warning.

The [installed Next output guide](../node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md) states that standalone output does not copy `public` or `.next/static` automatically. Those assets were copied following the existing Dockerfile layout, then `node .next/standalone/server.js` was started with isolated database, auth and VAPID settings. The [server record](server-verification.json), captured at **2026-09-25T14:21:00.132Z**, records HTTP 200 for all 12 checks: the homepage, manifest, favicon, offline page, watchlist, alerts, auth session, push status, market context, Nifty quote, Reliance analysis and one production JavaScript asset.

These checks verify local packaging, asset serving and endpoint response status. They do not verify a Docker image, production persistence, Google OAuth or notification delivery. The later build-only annotations/configuration did not change the UI captured by the browser suite below.

## Browser, mobile and accessibility

The final [browser record](browser-verification.json) was captured at **2026-09-25T14:12:04.931Z**, using **Chrome/154.0.8037.57** against `http://localhost:3000`. The [harness](../scripts/verify-ui.mjs) uses headless Chrome through DevTools and the existing `axe-core` dependency.

| Coverage | Observed result |
| --- | --- |
| Overview, Discover, report, watchlist, alerts and evidence at 1440 × 1000 | Six layouts passed: no horizontal document overflow; one visible H1 each; no detected targets below 44 px in width or height. |
| The same six views at 390 × 844 | Six layouts passed with the same results. |
| Automated accessibility across those 12 layouts | Zero axe violations for WCAG 2 A/AA and WCAG 2.1 AA tags. |
| Report at 320, 375 and 768 px wide | No horizontal document overflow. These three checks did not repeat the full accessibility/target audit. |
| Interaction assertions | All 14 passed. |
| Captured uncaught browser exceptions | None recorded. |

The interaction assertions covered scan filtering; keyboard autocomplete and active descendant; report navigation and heading focus; reachable report search disclosure; selected-engine evidence score; watchlist removal surviving reload; alert threshold/timeframe persistence; saved thresholds surviving form edits; reduced-motion CSS; report failure messaging; browser Back clearing the error; empty-watchlist navigation; loaded-app offline notice; and offline navigation without fabricated market figures.

The harness checks both width and height of visible buttons, links, inputs, selects and summaries and fails for detected targets below 44 px. This does not establish touch spacing, every collapsed state or behavior on physical hardware.

**Accessibility limits:** axe left `color-contrast` and `aria-prohibited-attr` checks incomplete on some pages. Zero automated violations is not a WCAG certification. Manual screen-reader testing, a complete manual contrast audit, physical iOS safe-area/PWA testing, Android device testing and Safari/Firefox coverage were not performed. Reduced motion and mobile viewports were emulated in Chrome.

## Local performance observations

Browser cache was disabled; **server/source caches were warm**, with no CPU or network throttling. These are short local observations, not field Core Web Vitals or cold mobile benchmarks.

| View | Script transfer | Decoded scripts | Observed LCP | Observed CLS | Long tasks |
| --- | ---: | ---: | ---: | ---: | --- |
| Overview | 156,818 bytes | 543,038 bytes | 96 ms | 0 | None |
| Report | 305,429 bytes | 1,051,273 bytes | 468 ms | 0 | One, 52 ms; 2 ms beyond the 50 ms threshold |

These totals describe resources observed on each sampled navigation, not the entire application's possible bundle. INP, cold scan latency, throttled devices, long-session layout stability and real-user performance were not measured. On-demand chart/report modules, disclosure, memoized calculations, disabled chart animation and paused inactive-view polling support performance but do not substitute for those measurements.

## Financial calculations and claims

The [frozen math regression](../scripts/verify-redesign-math.mjs) passed 18 cases across three engines, three deterministic trends and two history lengths. Numerical fields, verdicts, confidence labels and directions match the recorded pre-redesign baseline; displayed weighted contributions reproduce each tested score. Synthetic fixtures are test-only. This establishes no observed numerical regression in those cases, not correctness for all inputs or a profitable strategy.

The eight swing weights remain **18, 12, 12, 14, 14, 12, 8, 10**, grouped as trend **42**, momentum **28**, volume **12**, volatility **8** and structure **10**. Scoring and backtest arithmetic were not changed.

| Displayed claim | Evidence and limitation |
| --- | --- |
| No demonstrated edge | Inherited `validation.ts` findings remain visible beside bullish readings and in evidence. The redesign establishes no new profitable out-of-sample strategy. |
| Score versus confidence | Score is weighted rule direction. Confidence is agreement/trend clarity with engine-specific adjustments, not probability of profit. |
| Delayed Yahoo data | Retrieval time, daily-bar date and intraday observation time are distinguished where available. Poll frequency does not establish freshness. |
| Historical returns | Sample sizes and limitations accompany results. The default 0.2% round-trip cost is an assumption. Small samples, historical selection, overlapping observations and survivorship remain relevant. |
| Plans and sizing | Existing arithmetic is presented as a scenario. Stops do not guarantee maximum loss; gaps, slippage and costs can increase it. No execution capability was added. |
| Alerts | Existing daily-bar conditions, recalculated swing stop and six-hour cooldown are explained. A condition may already be true; alerts are not protective orders. |
| AI prose | Optional Ollama text is labeled; detected numerical prose falls back to the deterministic template. The guard is not proof that every generated qualitative statement is correct. |
| Persistence | Existing server APIs and identity paths remain. Anonymous access depends on browser identity cookies. |

### Unresolved external SMA200 comparison

The final [live verification](../scripts/verify-indicators.mjs) produced this TCS comparison:

| Measurement | Result |
| --- | ---: |
| Mean of fetched 200 daily closes | 2522.2630 |
| Yahoo published `twoHundredDayAverage` | 2508.4190 |
| Relative difference | **0.5519%** |
| Existing tolerance | **0.5%** |

This check failed. The other ten checks passed: SMA50, RSI14, EMA20, EMA50, ATR14, risk/reward arithmetic, stop below price, first target above price, second target above first, and score reproduction.

The discrepancy's cause is unresolved. Different observation timing or reference construction are possibilities, not verified explanations. Neither scoring math nor tolerance was changed to conceal the failure. Investigate synchronized inputs and Yahoo's reference methodology before reporting the independent indicator suite as fully passing.

#### Follow-up, 22 November 2026

**What the check actually compared.** Both "vs Yahoo" lines in `scripts/verify-indicators.mjs` compared the script's *own* naive mean of the fetched closes with Yahoo's published `fiftyDayAverage` / `twoHundredDayAverage`. The app's `sma()` was never called, so the failure said nothing about app code either way.

**Can Yahoo's figure be reproduced from Yahoo's own closes?** Tested on ten NSE stocks with the latest bar 2026-11-20 (market closed):

| Hypothesis | Result |
| --- | --- |
| Plain mean of the last 200 closes | Off by 0.20%–1.91% (TCS 1.66%, INFY 1.91%, HDFCBANK 1.39%) |
| Same, excluding the latest bar | Off by a similar amount (TCS 1.83%) |
| Mean of dividend/split-adjusted closes | Still off (TCS 0.33%, INFY −1.23%, HDFCBANK 0.58%) |
| Yahoo's figure is stale by *k* sessions (one lag shared by the 50- and 200-day averages, *k* = 0–40) | Rejected: the best shared lag was 0, leaving 1.16% average error per stock |

A search over window lengths found a best fit near 187 sessions for several stocks, but with 440 candidate windows per stock a close fit is expected by chance, so it is not treated as an explanation. Yahoo does not document how these fields are calculated. The SMA50 comparison also differed by 0.55% for TCS on this run, so it would have failed the old 0.5% tolerance too; its earlier passes were not evidence of agreement.

**Change made.** A new gated check compares the app's own SMA200 (`analysis.snapshot.sma200` from `/api/analyze`, the value the engines use) with a from-scratch mean of the same closes, at the 0.001% tolerance the RSI, EMA and ATR checks already use. The Yahoo comparisons are still printed on every run, marked `INFO … (not a gate)`, with the numbers visible. No tolerance was widened and no scoring math changed.

**Result after the change** (`npm run verify`, TCS, 22 Nov 2026): 11 of 11 gated checks passed, including SMA200 with a difference of 0.0000%. Diagnostics: SMA50 vs Yahoo 0.55%, SMA200 vs Yahoo 1.66%.

**What this does not establish.** It shows the app computes a 200-session simple mean correctly. It does not show that Yahoo's bars are correct; that would need a second data source such as exchange bhavcopy files, which the app does not use.

## Persistence and integration limits

Earlier mocked-transport checks passed for failed-load readiness, watchlist retry and rollback, confirmed deletion, alert HTTP errors, stored thresholds and retained rules after failed deletion. These complement browser persistence checks; they do not test production storage.

Not tested end to end: Google OAuth/login merge, real Web Push delivery, background notification delivery with the app closed, multi-device synchronization, production restart/storage behavior or physical-device installation. A saved push subscription does not prove device receipt. Alert scheduling requires a running server and depends on deployment settings.

## Brand status

**NIVRA remains provisional.** The [name screen](brand.md) found exact-name app listings, software/finance uses and potential trademark/domain conflicts. Official current trademark scope and relevant domain availability were not fully verified. No name or domain was registered, reserved or purchased.

Internal database filenames, environment variables, package identity and notification deduplication identifiers remain preserved. The frontend and assets are ready for review with the unresolved reference check and integration limits above disclosed.
