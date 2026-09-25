'use client';
import { memo } from 'react';
import type { ScreenRow } from '@/lib/screenAggregate';
import { inr, pct } from '@/lib/format';
import StarButton from './StarButton';
import Icon from './Icon';

export function setupReason(r: ScreenRow): string {
  if (r.tags.includes('Breakout')) return 'Above the 20-day range, with volume confirmation.';
  if (r.tags.includes('Pullback')) return 'Above the 50-day average, at or below 102% of the 20-day average.';
  if (r.tags.includes('Momentum')) return 'An established trend with positive momentum.';
  if (r.tags.includes('Squeeze')) return 'Bandwidth in the lowest fifth of available history. Direction unresolved.';
  if (r.tags.includes('Reversal')) return 'Oversold conditions with easing selling pressure.';
  return r.score >= 58 ? 'Weighted rules lean bullish; review the risk first.' : r.score < 40 ? 'Weighted rules lean bearish; trend risk remains.' : 'Mixed directional evidence across the weighted rules.';
}

function StockRows({ rows, onSelect }: { rows: ScreenRow[]; onSelect: (symbol: string) => void }) {
  return <div className="stock-rows">
    <div className="stock-row-head" aria-hidden="true"><span>Company / setup</span><span>Price / day</span><span>Score / 100</span><span>Research</span><span /></div>
    <ul>
      {rows.map(r => <li className="stock-row" key={r.symbol}>
        <button className="stock-identity" onClick={() => onSelect(r.symbol)}>
          <span className="ticker-avatar" aria-hidden="true">{r.symbol.replace(/\..*/, '').slice(0, 2)}</span>
          <span className="min-w-0"><strong>{r.name}</strong><span className="stock-meta">{r.symbol.replace(/\.(NS|BO)$/, '')} · {r.sector}</span><span className="stock-reason">{setupReason(r)}</span></span>
        </button>
        <div className="stock-price tnum"><strong>{inr(r.price)}</strong><span style={{ color: r.changePercent >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{pct(r.changePercent, 2, true)}</span></div>
        <div className="stock-score"><strong className="tnum">{r.score.toFixed(1)}</strong><span className="mini-track" aria-hidden="true"><i style={{ width: `${r.score}%`, background: r.score >= 58 ? 'var(--bull)' : r.score < 40 ? 'var(--bear)' : 'var(--muted)' }} /></span><span className="sr-only">Technical score out of 100</span></div>
        <button className="stock-open" onClick={() => onSelect(r.symbol)} aria-label={`Open ${r.name} intelligence report`}><span>{r.tags[0] ?? 'View setup'}</span><Icon name="arrow" /></button>
        <div className="stock-save"><StarButton symbol={r.symbol} name={r.name} /></div>
      </li>)}
    </ul>
  </div>;
}
export default memo(StockRows);
