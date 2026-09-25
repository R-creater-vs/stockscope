'use client';
import { memo, useState } from 'react';
import type { SectorStat } from '@/lib/screenAggregate';
import { pct } from '@/lib/format';

function SectorHeatmap({ sectors, onSelect }: { sectors: SectorStat[]; onSelect: (symbol: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sectors : sectors.slice(0, 6);
  return <section className="sector-section" aria-labelledby="sector-heading">
    <div className="section-heading"><div><span className="eyebrow">02 / PARTICIPATION</span><h2 id="sector-heading">Sector rotation</h2></div><span className="text-xs text-[var(--muted)]">Ranked by average score</span></div>
    <p className="section-description">A snapshot of the scanned universe, not fund flows. Select a sector to inspect its highest-scoring stock.</p>
    {!sectors.length ? <div className="empty-state">No sector data available for this scan.</div> : <div className="sector-grid">{visible.map((s, i) => <button className="sector-cell" key={s.sector} disabled={!s.leader} onClick={() => s.leader && onSelect(s.leader.symbol)} aria-label={`${s.sector}, average score ${s.avgScore.toFixed(1)}, ${s.count} stocks. Open ${s.leader?.name ?? 'leader unavailable'}`}>
      <div className="sector-name"><span className="tnum sector-rank">{String(i + 1).padStart(2, '0')}</span><strong>{s.sector}</strong><span className="tnum">{Math.round(s.avgScore)}<span className="sr-only"> out of 100</span></span></div>
      <div className="sector-bar" aria-hidden="true"><i style={{ width: `${s.avgScore}%`, background: s.avgScore >= 50 ? 'var(--bull)' : 'var(--bear)' }} /></div>
      <div className="sector-detail"><span className="tnum" style={{ color: s.avgMomentum >= 0 ? 'var(--bull)' : 'var(--bear)' }}>{pct(s.avgMomentum, 1, true)} <span className="text-[var(--muted)]">1M avg.</span></span><span>{s.count} stocks · {s.breadth}% bullish</span></div>
    </button>)}</div>}
    {sectors.length > 6 && <button className="text-link" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show leading six' : `See all ${sectors.length} sectors`} <span aria-hidden="true">{expanded ? '−' : '+'}</span></button>}
    <p className="fine-print">Score /100 describes rule direction. Sector momentum uses the existing scan calculation, which treats missing one-month returns as zero.</p>
  </section>;
}
export default memo(SectorHeatmap);
