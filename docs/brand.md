# NIVRA working identity

NIVRA is a **provisional design name, not a cleared trademark**. The implementation adopts it for local product review. The screening below found existing uses, including finance-adjacent uses. Do not treat the redesign as approval to adopt the name commercially.

## Concept

**Understand the setup. See the risk. Decide with clarity.**

The brand is a calm place to read evidence. It earns trust by putting the directional score beside its explanation and its limitations. The visual signature is a deep green-black canvas, warm paper-like reading areas, precise rules, aligned numbers and a single citron accent. Citron signals selection and navigation, never a prediction of profit.

NIVRA is short, balanced in uppercase and easy to set in a narrow mobile header. Its quiet sound fits considered decisions. This is a visual and phonetic rationale, not an assertion of etymology or uniqueness. Because screening found conflicts, the visual system should survive a future name change.

## Name screening — 24 September 2026

This was a preliminary public web screen. Store search results are not a reservation check; a registered domain is not necessarily purchasable. A failed website request does not indicate availability. Trademark scope and ownership require official records and qualified clearance before adoption.

| Check | Observed evidence | Status for this project |
| --- | --- | --- |
| Indian trademark | A [secondary index of application 2617183](https://www.indiafilings.com/search/nivra-tm-2617183) lists NIVRA, class 9, K. Anandhasayanam, with computer software among the goods and a Registered status. An earlier search result showed a different status. The [official IP India e-register](https://tmrsearch.ipindia.gov.in/eregister/) did not expose an inspectable record in this environment. | Potential conflict; official current status and scope unverified. |
| UK trademark | A [secondary record for UK00004149837](https://www.trademarkia.com/nivra-UK00004149837) reports an exact word mark registered in class 36 with financial data analysis and credit services among the specifications. The [official UK IPO record](https://trademarks.ipo.gov.uk/ipo-tmcase/page/Results/1/UK00004149837) could not be retrieved. | Relevant finance conflict to investigate; no legal conclusion. |
| Indian software market | [Nivra Technologies](https://www.nivratechnologies.com/industries/finance) publicly markets software for financial businesses from Hyderabad. | Existing technology/finance use. |
| Apple App Store | [Nivra: Meditation & Sleep](https://apps.apple.com/us/app/nivra-meditation-sleep/id6751748071), by Blupp Infotech Private Limited, is listed. The listing links nivra.app as its privacy-policy domain. | Exact name already appears in a store. |
| Google Play | [Nivra: Turn Cravings into Cash](https://play.google.com/store/apps/details?id=com.northbyte.nivra), by Northbyte, is listed and describes saving and investment-related functionality. | Exact name already appears; finance-adjacent positioning. |
| nivra.com | [WHOIS aggregation](https://who.is/whois/nivra.com) reports registered/parked, created 2011, expiry April 2027, with a September 2026 lookup. Direct Verisign RDAP retrieval failed here. | Not shown available for new registration; registry confirmation still needed. |
| nivra.in | The official [.IN registry creation report for 2 July 2025](https://www.registry.in/system/files/domain-creates_02-07-2025.pdf) includes nivra.in. Direct site access failed. Historical registration does not establish present availability. | Previously registered; current registration/availability unverified. |
| nivra.app | The Apple listing above links to this domain. [DNS records indexed by Hurricane Electric](https://ipv4.bgp.he.net/dns/nivra.app) also show delegated nameservers and address records. Direct site access failed. | Evidence of existing use; do not assume available. |

**Decision:** retain NIVRA solely as the requested working identity. Name clearance remains open and the public evidence argues against assuming exclusivity. Before launch, verify Indian exact/phonetic marks in relevant software, financial and technology service classes, inspect the official records, check target-country rights and store titles, and select/acquire a cleared domain. No domain, trademark or app name was reserved or purchased.

## Mark and explorations

The selected **signal aperture** comprises two opposed brackets framing an open central field. Its deliberate breaks suggest interpreting incomplete evidence; its balanced mass keeps the identity composed. It contains no chart, arrow, candlestick, magnifier or letter monogram. It is new geometry drawn for this project, not a claim of legal design clearance.

[View the vector exploration board](../public/brand/explorations.svg) or [PNG preview](../public/brand/explorations.png). It compares three actual geometry studies:

1. **Signal aperture — selected.** Two open frames hold opposing evidence in balance. The two gaps survive reduction.
2. **Interval.** Three displaced bands suggest sequence, but resemble a generic list/menu.
3. **Parallax.** Brackets and a central point suggest aligned viewpoints, but become crowded at small sizes.

The wordmark uses original outlined uppercase geometry, so exported assets have no external font dependency. The interface uses the existing Geist family and tabular numerals for numbers.

## Asset inventory

All vector files are in `public/brand`. `on-dark` means designed for an ink background; `on-light` means designed for a warm background.

| Asset | Files | Use |
| --- | --- | --- |
| Compact mark | `mark-on-dark.svg`, `mark-on-light.svg`, `mark-monochrome.svg` | Header, compact navigation, one-color applications; 32-unit source grid. |
| Wordmark | `wordmark-on-dark.svg`, `wordmark-on-light.svg`, `wordmark-monochrome.svg` | Text-only brand signature; paths, not embedded text. |
| Mark + wordmark | `logo-on-dark.svg`, `logo-on-light.svg`, `logo-monochrome.svg` | Full brand signature. |
| Browser icon | `favicon.svg`, `src/app/favicon.ico` | SVG and 16/32/48 px ICO entries. |
| App icon | `app-icon.svg`, `public/icon.png`, `icon-192.png` | Full-bleed ink square and citron mark; 512/192 px PNGs. |
| Maskable app icon | `app-icon-maskable.svg`, `icon-maskable-512.png` | Distinct smaller mark, full-bleed background, 512 px. |
| Apple touch icon | `apple-touch-icon.png` | 180 px; system applies the outer shape. |
| Notification badge | `notification-badge.png` | White silhouette with transparent background, 96 px. |
| Exploration sheet | `explorations.svg`, `explorations.png` | Identity rationale, alternatives and size ladder. |

Reproduce the assets with `node scripts/generate-brand-assets.mjs`, using the repository's installed Sharp dependency. SVGs and app icons are generated entirely from code-native vector geometry. The exploration board uses system Arial for annotations; only that board depends on a system text font.

## Usage rules

- Minimum compact size: 16 px. Prefer 24–32 px in product chrome. Keep the original two gaps open; do not stroke, round, rotate or distort the mark.
- Keep at least 6 source-grid units of clear space from the visible mark to other content. In a small product header, the SVG's own 5-unit inset contributes to that space.
- Display the wordmark at 96 px wide or above; the full horizontal signature at 140 px or above. At smaller sizes, use the compact mark plus accessible product text.
- Use citron on ink or ink on warm. Use monochrome variants for one-color reproduction. Do not recolor the logo red/green with the market direction.
- Use the 512 px maskable asset for `purpose: maskable`. Its visible bounds are 124–388 px on both axes; the farthest corner is approximately 187 px from center, inside the required central 204.8 px safe radius. Do not add a rounded-square plate inside an operating system mask.
- Mark-only links need a useful accessible name, such as “NIVRA market overview”. Decorative marks next to visible NIVRA text should be hidden from assistive technology.
- The logo must never function as an animated market signal. No pulsing, flashing, upward flights or profit imagery.

## Product icon rules

Use a coherent 24-unit grid with 1.7–1.8 px strokes, simple geometric construction and consistent end caps. Prefer recognizable line icons for overview, search/discovery, watchlist, alert, evidence and account. Icons reinforce visible labels; bottom navigation retains short text labels. Controls use at least 44 px touch targets even when the glyph is 18–22 px. A positive/negative number has a sign and text context in addition to color. Status dots are never the only status label.

## Voice and information ethics

Lead with the observation, then the decision-relevant limit: “Bullish rules; no demonstrated strategy edge.” Say what a score measures and when data was observed. Confidence means agreement and trend clarity; it is not a probability of profit. “Quote checks every 30 seconds” must not be presented as a fresh real-time market feed. AI prose, where configured, is labeled separately and does not supply or modify figures.

Use plain language: “Read the setup”, “Review the risk”, “Create price alert”, “View strategy evidence”. Avoid performance superlatives, notification pressure, artificial urgency and reward loops. The product is research and decision support, without an order execution claim.

## Migration boundary

Metadata, install title, manifest, user-visible notification titles, service-worker fallbacks, news-reader identity and brand imagery use NIVRA. Internal persistence keys, database paths, environment variables, package identity and the default `stockscope` notification deduplication tag remain unchanged. This preserves existing installations, sessions and stored monitoring data without an unplanned migration.
