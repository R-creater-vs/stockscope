/** Display helpers. Indian number formatting throughout (lakh/crore grouping). */

export function inr(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function num(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function pct(n: number | null | undefined, decimals = 2, sign = false): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(decimals)}%`;
}

/** Fractions from the API (0.36 = 36%) rendered as a percentage. */
export function fracPct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/** Market cap in crore / lakh crore, the units Indian investors actually use. */
export function marketCap(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const crore = n / 1e7;
  if (crore >= 1e5) return `₹${(crore / 1e5).toFixed(2)} lakh Cr`;
  return `₹${crore.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

export function compactVolume(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * "3 min ago" / "2 days ago". Used to honestly label scan freshness — the
 * screener can legitimately be serving a scan from before the last server
 * restart while a background refresh catches up, and that age should be
 * visible rather than papered over with a plain "updated" label.
 */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return 'just now';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
