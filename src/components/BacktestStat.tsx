/** Historical results remain neutral in presentation; sample size is always visible. */
export function BacktestStat({ winRate, trades, expectancyR }: { winRate: number | null; trades: number; expectancyR: number | null }) {
  if (trades === 0 || winRate === null) return <span className="text-xs text-[var(--muted)]">No simulated trades</span>;
  return <span className="tnum text-xs leading-relaxed text-[var(--muted)]" title="Past-year simulation using a 0.2% round-trip cost assumption. Small samples and historical selection limit interpretation; no demonstrated edge in the weighted swing score.">
    {winRate.toFixed(1)}% win · {trades} trades{expectancyR !== null && <> · {expectancyR > 0 ? '+' : ''}{expectancyR.toFixed(2)}R/trade</>}
  </span>;
}
