# NIVRA interface system

NIVRA is a provisional design name. See [brand.md](brand.md) for the naming conflict check, source links, vector assets and mark rules. Positioning: **Understand the setup. See the risk. Decide with clarity.**

## Visual language

The signature is an ink workspace, a warm paper market brief, citron navigation, numbered sections and precisely aligned research rows. The interface does not rely on a logo to distinguish it. There are no ambient gradients, decorative sparklines or flashing market signals. A sector bar represents its actual aggregate score; it is never a fictional price chart.

| Token | Value | Purpose |
| --- | --- | --- |
| Background | `#101714` | Deep ink canvas |
| Surface | `#19221d` | Research sections |
| Raised surface | `#232e27` | Selected controls and disclosures |
| Paper | `#eeeee5` | Market brief, foreground ink `#18241d` |
| Foreground | `#f0f0e8` | Primary text |
| Muted | `#abb5ac` | Supporting text |
| Secondary muted | `#9aa89d` | Source notes |
| Border | `#344238` | Quiet row and section rules |
| Strong border | `#526255` | Controls and separators |
| Accent / focus | `#d6ed8b` | Citron selection; dark text on filled controls |
| Bullish | `#87d5b4` | Positive directional evidence |
| Bearish | `#f5a296` | Negative directional evidence |
| Caution | `#e4c78e` | Limitations and uncertainty |

Green/red always travels with a signed number or directional word. The warm paper panel uses darker semantic text (`#246346` / `#923c32`) for contrast. Citron indicates selection and brand, not profit.

Typography: locally served Geist via Next font optimization, Geist Mono for numerical columns; system fallbacks. Headline sizes scale from 29px on phones to 42px on desktop. Body copy is 14–16px, supporting copy 12px; sparse navigation/section overlines use 10–11px. Numbers use tabular figures. Information hierarchy comes from scale, weight and whitespace, not a card around every number.

Spacing: 4px base rhythm, 16px mobile gutters, 24–60px desktop gutters, 24px between sections. Controls have a 44px minimum target; primary mobile navigation targets are 50px. Section corners are 8px and controls 5px. Focus uses a 2px citron outline with visible separation. No interaction depends on hover.

## Components and states

- **Navigation:** fixed desktop rail, five destinations; fixed mobile bottom navigation with safe-area padding. Reports are contextual drill-downs. URL query parameters preserve destinations and notification stock links, with browser back/forward support.
- **Search:** labeled combobox, debounced provider search, arrow-key selection, Enter, Escape and direct symbol submission. Search spans NSE/BSE; the scanner is explicitly NSE-only.
- **Research rows:** company identity, setup explanation, signed price move, score and independent save/report controls. Mobile rows reflow rather than hiding company rationale in horizontal tables.
- **Filters:** text, sector, setup category, price presets/custom range and sort. Controls expose selection with `aria-pressed` or native labels. Large lists reveal 30 rows at a time.
- **Evidence:** baseline 50 plus signed weighted contributions. Five groups organize the eight swing rules. Each detail expands independently. Missing checks are excluded and normalization is explained. The engine's score and confidence remain separate.
- **Charts:** actual supplied bars only, memoized calculations, no animation, on-demand module loading. An accessible data table supplements the price chart. Intraday context is collapsed until requested.
- **Disclosure:** native details or buttons with expanded state/control relationship. Price action, evidence, plan and risk lead; extended narrative and deeper research are secondary.
- **Loading:** layout-reserving skeleton rows and report blocks, with status text. Market state stays unknown until data arrives.
- **Empty:** explain why, provide a route to Discover or reset filters. Empty historical results are not disguised as zero-percent success.
- **Error:** retain prior values on refresh failure, explicitly mark them as potentially stale, and offer retry. Failed saves are not presented as success.
- **Stale:** scan computation time and age are separate from underlying quote freshness. Yahoo data remains labeled delayed, even when retrieval just completed.
- **Offline:** the loaded app shows an offline notice. A service worker caches only an explicit offline page and its icon for navigation failure; it does not cache financial API responses.
- **Motion:** short opacity transitions only; `prefers-reduced-motion` disables transitions, pulses, spins and smooth scrolling.

## Six responsive views

| View | First read | Secondary content | Mobile behavior |
| --- | --- | --- | --- |
| Market overview | Nifty regime, actual daily-bar close, provider market status, source date | Ranked sector scores and up to five fixed-filter bullish readings | Paper brief stacks; sectors become ruled rows; bottom navigation remains reachable |
| Discover | Search and transparent scan universe | Sector/price/setup filters, sort, reason per stock, historical ranking | Filter controls wrap; setup chips scroll within their own strip; rows reflow |
| Stock intelligence | Company/exchange, price, timeframe, descriptive verdict, score/confidence, validation limitation, deterministic read | Price action, grouped signal contribution, illustrative plan, risk, news, optional alerts and historical/fundamental research | Single reading column; disclosures limit initial complexity; figures use tabular alignment |
| Watchlist | Saved stocks and available refreshed scores | Change from previous session refresh, signed daily move, active-rule count, report/save actions | Compact stacked rows, sorting and retry; explicit unknown/missing states |
| Alerts | Delivery status and saved rule conditions | Last trigger, event history, check now, creation in a stock report | Native form controls, exact condition preview, confirmed persistence, optional notifications |
| Strategy evidence | Existing stored finding: no demonstrated edge | Samples, stocks, net expectancy, correlation, period comparison, costs and limitations, optional universe run | Two-column metrics, compact comparison table, explicit proxy limitations |

## Financial communication rules

1. API `BUY` / `STRONG_BUY` enums remain unchanged; visible assessment labels say bullish bias. They describe rules, not recommendations.
2. Keep the weighted swing model's lack of demonstrated edge beside bullish readings and in evidence. Negative historical correlation does not validate an inverse strategy.
3. Confidence is agreement and trend clarity (with weekly adjustment for swing); long-term confidence incorporates data completeness. It is never a probability of profit.
4. Historical observation counts are not independent trade counts. Show costs, sample limitations, overlap and survivorship concerns beside results.
5. Quote endpoint `at` is retrieval time. It is not exchange time. Daily-bar dates and intraday point timestamps are shown only when supplied.
6. A refresh every minute does not make a delayed quote live. No broker execution or unavailable AI capability is implied.
7. Ollama prose is optional and labeled. Numerical AI prose is rejected in favor of the deterministic template; calculations belong to the engine. Prompts cannot establish mathematical correctness.
8. Stops/targets are illustrative levels. Gaps, slippage and costs can increase losses. Position sizing is a scenario, not a guarantee or suitability assessment.
9. Alert conditions use the actual daily-bar evaluator, including a recalculated stop and six-hour cooldown. They are not guaranteed instant crossing alerts.

## Implementation boundaries

Existing database filename, environment variables, cookies, tables, auth endpoints and notification deduplication tag are preserved. Scoring, confidence and backtest arithmetic are unchanged. Presentation prose was made observational. Additive `MarketContext.sourceBarDate` exposes an already available bar date; the quote endpoint permits the fixed Nifty symbol to report provider status. Next 16 configuration and Proxy naming were updated according to installed documentation. Browser-side persistence hooks now surface failures and roll back unconfirmed optimistic changes.

Build tracing safeguards keep runtime data separate from the deployment artifact: tracing annotations in `auth.ts`, `push.ts` and `db.ts`, together with explicit output exclusions, prevent local `.data` and `.env*` files from being packaged. Runtime paths and persistence behavior stay unchanged; the `auth.ts` and `db.ts` changes are comments only. The final clean build completed without an NFT tracing warning. Its standalone root contained only `.next`, `node_modules`, `package.json` and `server.js`, with no `.data` or environment files. Run `npm run verify:bundle` after building and before starting that server to check this boundary again.

The standalone HTTP smoke check used isolated database, authentication and VAPID paths. All 12 tested responses returned HTTP 200; the exact endpoints and capture time are in [server-verification.json](server-verification.json). This confirms those local routes/assets responded, not notification receipt or a production service guarantee. No browser push delivery was exercised by that check.
