'use client';
import type { ScreenData } from '@/lib/useScreen';
import { buildBuckets } from '@/lib/screenAggregate';
import RegimeBanner from './RegimeBanner';
import SectorHeatmap from './SectorHeatmap';
import StockRows from './StockRows';
import DataStatus from './DataStatus';
import { ScanSkeleton } from './Discover';
import Icon from './Icon';

export default function MarketOverview({ data, error, loading, refresh, onSelect, onDiscover, onEvidence }: { data: ScreenData | null; error: string | null; loading: boolean; refresh: () => void; onSelect: (symbol: string) => void; onDiscover: () => void; onEvidence: () => void }) {
  const shortlist = data ? buildBuckets(data.all, 5).find(b => b.id === 'best')?.rows ?? [] : [];
  return <div className="overview-content">
    <RegimeBanner />
    <div className="overview-divider"><span>THE SIGNAL IS A STARTING POINT.</span><button onClick={onEvidence}>Understand the evidence <Icon name="arrow" /></button></div>
    {error && <div className="notice" role="alert">{error} {data && 'The previous scan remains visible.'}<button onClick={refresh}>Retry scan</button></div>}
    {!data && loading ? <ScanSkeleton /> : data ? <>
      <SectorHeatmap sectors={data.sectors} onSelect={onSelect} />
      <section className="opportunities"><div className="section-heading"><div><span className="eyebrow">03 / YOUR NEXT RESEARCH</span><h2>Setups in focus</h2></div><button className="text-link" onClick={onDiscover}>Explore universe <Icon name="arrow" /></button></div><p className="section-description">Up to five bullish rule readings with confidence ≥50, ranked by score. Curated by fixed filters, not recommendations.</p>
        <div className="evidence-inline"><Icon name="evidence" /><p><strong>No demonstrated edge.</strong> The existing weighted swing score has not shown a reliable advantage in historical testing. A high score is a description, not a forecast.</p></div>
        {shortlist.length ? <StockRows rows={shortlist} onSelect={onSelect} /> : <div className="empty-state"><h3>No setups clear this filter.</h3><p>There is no need to force a shortlist. Explore the full scan for a broader view.</p><button className="btn-glass" onClick={onDiscover}>Open Discover</button></div>}
      </section>
      <div className="scan-footer"><span>{data.scanned} scored / {data.scanned + (data.failed ?? 0)} attempted · NSE scan · daily bars</span><DataStatus at={data.generatedAt} /><button className="text-link" onClick={refresh} disabled={loading}><Icon name="refresh" />{loading ? 'Refreshing scan' : 'Refresh scan'}</button></div>
    </> : null}
    <section className="reading-guide"><span className="eyebrow">A CALMER WAY TO RESEARCH</span><div><p><span>01</span><strong>Read the backdrop.</strong>Start with the index and sector context.</p><p><span>02</span><strong>Question the setup.</strong>See the rules, their weights and disagreements.</p><p><span>03</span><strong>Define the downside.</strong>Inspect the plan and the limits before deciding.</p></div></section>
  </div>;
}
