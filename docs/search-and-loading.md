# Simpler stock search and bounded loading

This follow-up keeps the NIVRA visual system and simplifies the route from a company name to its report: **Search a stock → read the quick summary → inspect risk or run a history check.**

## Changes

- A visible Search a stock label, company-name examples, an explicit Search button and an IRFC shortcut replace Research. Keyboard autocomplete still works. Missing suggestions are distinguished from a failed search service.
- Discover puts optional filters and sorting behind one disclosure, so its second text field does not compete with the main search.
- Loading shows the requested stock, actual seconds elapsed and Cancel. It does not invent a completion estimate. Reports have a 25-second server deadline and a 30-second browser deadline with retry. Replacing a search cancels the old request.
- Known directory names resolve without an extra quote lookup. Reports have a separate bounded Yahoo queue from background scans and fetch history and company data together. The directory supplies identity only, never prices.
- Optional fundamentals have a 4-second limit. Missing information stays unknown and is disclosed, including beside an affected long-term assessment. Initial prose is rule-based; optional AI remains explicitly available through the API with a 5-second limit.
- Reports have a compact timeframe selector, plain section navigation and a prominent Run history check action. Full comparisons, signals, plans, sizing, news, company information and alerts remain available.
- History checks start on request and show elapsed time, stop/resume, errors and retry. Browser waiting ends after three minutes; stopping the screen does not claim to cancel the server job. Failed jobs stay visibly failed until an explicit retry.
- Historical calculations yield between short computation slices, allowing search, network responses and polling to run. Stock history, scan backtests and strategy studies use the same replay. Calculation rules and results are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Lint and TypeScript | Passed. |
| Production Webpack build (`build:termux`) | Passed on Windows; physical Android/Termux was not available for testing. |
| Standalone packaging/startup | Final postbuild verification passed with no local runtime files or trace references. All 12 HTTP/asset checks passed against the final standalone server and an isolated test database; see [server results](server-verification.json). |
| Loading/transport regressions | 14 passed, including identity resolution, parallel work, separate queues, timeout, cancellation, retry, partial data, invalid names and BSE fallback. |
| Engine regression | All 18 frozen numerical cases passed. |
| Historical replay regression | All 18 complete output hashes matched for synchronous and yielding replay. Timers continued during an actual 1,400-bar test replay. |
| History lifecycle | Explicit start, polling, elapsed time, stop/resume, cancellation, errors, explicit retry, finite waiting and completed results passed. Job deduplication, persistence and failed-state handling passed. |
| Six-view browser review | All six views passed at 1440 × 1000 and 390 × 844: no horizontal overflow, no detected targets below 44 px, zero automated axe WCAG A/AA violations. Reports also fit at 320, 375 and 768 px. All 14 existing interaction assertions passed. |
| Mobile search browser checks | All 8 passed: IRFC, full company name, keyboard selection, elapsed time/cancel, replacement requests, timeout/retry, late suggestions and unavailable suggestions. Zero captured runtime exceptions. |
| Live history browser checks | All 5 passed: section navigation without automatic computation, three timeframe readings matching the API, visible history elapsed time, another stock opening while the history screen was pending, and completed results with samples/costs/limitations. No browser exceptions or mobile overflow. |

See [browser results](browser-verification.json), [search browser results](search-browser-verification.json), and the updated [screenshots](screenshots.md). Transport delays and errors are simulated in the search browser checks; successful report bodies come from the actual local API/Yahoo source. The browser timeout was observed at 29,990 ms. This verifies the waiting limit, not a forecast of provider response time.

A separate live check returned IRFC in 4.024 seconds, its full company name from cache in 2 ms, and an invalid symbol as 404 in 1.705 seconds. These are local observations, not promised phone timings. Network speed, device speed, queue state and source availability still matter.

The [live history browser record](history-browser-verification.json) captured IRFC's pending response and “1s elapsed,” followed by TCS opening in 825 ms while the history waiting screen was still pending. Returning to IRFC displayed the completed source-backed replay with 100 trades and 1,183 overlapping signal samples. The test confirms these interactions on this local machine; it does not establish cold phone latency or profitable returns.

Reproduce the focused checks:

```sh
node scripts/verify-search-loading.mjs
node scripts/verify-backtest-responsiveness.mjs
node scripts/verify-history-flow.mjs
node scripts/verify-history-jobs.mjs
node scripts/verify-build-sanitizer.mjs
```

Browser scripts require a running local app with an isolated test database and Chrome: `scripts/verify-ui.mjs`, `scripts/verify-search-browser.mjs`, and `scripts/verify-history-browser.mjs`. The optional `--live` argument to `verify-search-loading.mjs` checks the current source.

## Limits retained

The weighted swing score still has **no demonstrated stable edge**. Confidence is signal agreement, not probability of profit. Historical results, costs, samples and limitations remain visible. Prices remain delayed Yahoo observations; request completion does not establish price freshness. No broker execution or predictive capability was added.

The earlier external SMA200 reference discrepancy in [the redesign verification](verification.md) was not changed or presented as resolved. These changes were checked for numerical equivalence, not used to claim a newly validated trading strategy. Automated checks do not establish full WCAG conformance or physical mobile performance.

## Update an existing Termux installation

Stop the running server with Ctrl+C, then run:

```sh
cd ~/nivra
git pull
npm run build:termux && npm start
```

Open `http://localhost:3000` on the same phone. The Webpack build avoids Android's unsupported Turbopack native bindings. Rebuild after pulling; a Git update alone does not update the production build.

## Build packaging guard

The Windows Webpack build exposed a Next 16.2.11 tracing issue: API route `.nft.json` manifests included local `.data` files despite the existing exclusion. Reproducing the installed `collect-build-traces` matcher showed that its Windows `path.join` result did not match `.data/auth.json`; normalizing both paths to forward slashes made the same pattern match. This was a trace inclusion, not merely a stale runtime directory. Only filenames and trace metadata were inspected.

Both npm build commands now run a postbuild guard. It removes local runtime copies from generated standalone output and their references from generated trace manifests, then verifies the artifact. Source database paths, environment variables, identities and files remain unchanged. The guard checks resolved paths, rejects linked output directories, and unlinks a copied symlink without following its destination. Existing cross-platform tracing exclusions remain in place.

`node scripts/verify-build-sanitizer.mjs` passed disposable-fixture checks for source and app-asset preservation, trace cleanup, idempotence and symlink handling. `npm run verify:bundle` checks both the standalone directory and generated trace references; it should run before starting or distributing a standalone build. Use the npm build scripts so their postbuild hooks run.
