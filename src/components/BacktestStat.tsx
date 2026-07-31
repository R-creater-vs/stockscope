/**
 * The lightweight backtest read for a listed stock: how this name's swing setups
 * did over the past ~year. Deliberately understated — coloured green only when a
 * decent win-rate is backed by enough trades AND positive expectancy, so a lucky
 * 100%-of-2-trades never masquerades as an edge. Small samples are context, not
 * a forecast; the surrounding UI says so.
 */
export function BacktestStat({
  winRate,
  trades,
  expectancyR,
}: {
  winRate: number | null;
  trades: number;
  expectancyR: number | null;
}) {
  if (trades === 0 || winRate === null) {
    return <span className="tnum text-[11px] text-[var(--muted-2)]">no trades</span>;
  }

  const strong = winRate >= 55 && trades >= 5 && (expectancyR ?? 0) > 0;
  const color = strong ? 'var(--bull)' : 'var(--muted)';
  const rNote =
    expectancyR !== null ? ` · avg ${expectancyR > 0 ? '+' : ''}${expectancyR.toFixed(2)}R per trade` : '';

  return (
    <span
      className="tnum text-[11px] font-medium"
      style={{ color }}
      title={`${winRate}% of ${trades} simulated swing trades were profitable over the past year${rNote}. Net of ~0.2% costs, no look-ahead. Small sample — not a forecast.`}
    >
      {winRate}% win · {trades} tr
    </span>
  );
}
