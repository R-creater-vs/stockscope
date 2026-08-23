/**
 * The alert scheduler. Started once when the Node server boots (from
 * instrumentation.ts) and thereafter re-scans every watched stock on an interval,
 * firing push notifications when a rule trips. This is the piece that makes
 * alerts "real" — they happen on the server's clock, not when someone opens a tab.
 */

import { scanAlerts } from './alerts';
import { warmScreenCache } from './screener';

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  // Prime the stock-screener cache from disk and kick a background refresh —
  // see warmScreenCache() for why. Routed through here (rather than a direct
  // call from instrumentation.ts) so it rides the same Webpack IgnorePlugin
  // exclusion already proven for this module; see next.config.ts.
  warmScreenCache();

  const intervalMs = Number(process.env.ALERT_INTERVAL_MS ?? 15 * 60 * 1000);

  const tick = async () => {
    try {
      const summary = await scanAlerts();
      if (summary.fired > 0) {
        console.log(`[alerts] ${summary.fired} fired across ${summary.symbolsScanned} symbols`);
      }
    } catch (err) {
      console.error('[alerts] scan failed', err);
    }
  };

  // A short delay after boot lets the server settle before the first sweep.
  setTimeout(tick, 30_000);
  setInterval(tick, intervalMs);
  console.log(`[alerts] scheduler started (every ${Math.round(intervalMs / 60000)} min)`);
}
