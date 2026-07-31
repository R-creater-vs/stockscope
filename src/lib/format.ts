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
