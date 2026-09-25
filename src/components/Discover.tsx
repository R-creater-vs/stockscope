'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PriceFilter, { ANY_PRICE, type PriceRange } from './PriceFilter';
import { buildBuckets, isHighConviction } from '@/lib/screenAggregate';
import type { ScreenData } from '@/lib/useScreen';
import StockRows from './StockRows';
import DataStatus from './DataStatus';
import Icon from './Icon';
const SpecialList = dynamic(() => import('./SpecialList'));

export default function Discover({ data, error, loading, refresh, onSelect }: { data: ScreenData | null; error: string | null; loading: boolean; refresh: () => void; onSelect: (symbol: string) => void }) {
  const [category, setCategory] = useState('all');
  const [range, setRange] = useState<PriceRange>(ANY_PRICE);
  const [sector, setSector] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');
  const [limit, setLimit] = useState(30);
  const [history, setHistory] = useState(false);
  const inRange = useMemo(() => (data?.all ?? []).filter(r => r.price >= range.min && r.price <= range.max && (sector === 'all' || r.sector === sector) && `${r.name} ${r.symbol}`.toLowerCase().includes(query.toLowerCase())), [data, range, sector, query]);
  const buckets = useMemo(() => buildBuckets(inRange, 10000), [inRange]);
  const aligned = useMemo(() => data?.market ? inRange.filter(r => isHighConviction(r, data.market)) : [], [data, inRange]);
  const selected = category === 'all' ? inRange : category === 'aligned' ? aligned : buckets.find(b => b.id === category)?.rows ?? [];
  const sorted = [...selected].sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'change' ? b.changePercent - a.changePercent : sort === 'name' ? a.name.localeCompare(b.name) : sort === 'confidence' ? b.confidence - a.confidence : b.score - a.score);
  const sectors = [...new Set(data?.all.map(r => r.sector) ?? [])].sort();
  const categories = [{ id: 'all', title: 'All stocks', count: inRange.length }, { id: 'aligned', title: 'Timeframes aligned', count: aligned.length }, ...buckets.map(b => ({ ...b, count: b.rows.length }))];
  return <div className="view-content">
    <div className="section-heading"><div><span className="eyebrow">THE RESEARCH UNIVERSE</span><h2>Find a setup worth understanding.</h2></div><button className="btn-glass" disabled={loading} onClick={refresh}><Icon name="refresh" />{loading ? 'Refreshing' : 'Refresh scan'}</button></div>
    <div className="filter-bar"><label className="filter-search"><Icon name="search" /><input aria-label="Filter scanned stocks" placeholder="Filter by company or symbol" value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label><label className="select-field"><span>Sector</span><select value={sector} onChange={e => { setSector(e.target.value); setLimit(30); }}><option value="all">All sectors</option>{sectors.map(s => <option key={s}>{s}</option>)}</select></label><label className="select-field"><span>Sort by</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="score">Score, high to low</option><option value="confidence">Confidence, high to low</option><option value="change">Daily change</option><option value="price">Price, low to high</option><option value="name">Company name</option></select></label></div>
    <details className="price-disclosure"><summary>Price range <span>{range.label}</span></summary><div><PriceFilter value={range} onChange={r => { setRange(r); setLimit(30); }} /></div></details>
    <div className="category-tabs" aria-label="Setup categories">{categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setLimit(30); }}>{c.title}<span className="tnum">{c.count}</span></button>)}</div>
    <p className="section-description">{category === 'all' ? 'Every successfully scored stock in the scan. Open a report to inspect the evidence behind its score.' : category === 'aligned' ? 'Bullish short, mid and long price-trend proxy; confidence ≥55, reward:risk ≥1.3, and Nifty above its 50-day average. These filters are not validated predictors of profit.' : buckets.find(b => b.id === category)?.blurb}</p>
    <div className="evidence-inline"><Icon name="evidence" /><p><strong>No demonstrated edge in the weighted swing score.</strong> A bullish reading describes the rules, not an expected return. Confidence measures agreement, not probability of profit.</p></div>
    {error && <div className="notice" role="alert">{error} {data && 'The previous scan remains visible.'}<button onClick={refresh}>Try again</button></div>}
    {!data && loading ? <ScanSkeleton /> : sorted.length ? <StockRows rows={sorted.slice(0, limit)} onSelect={onSelect} /> : <div className="empty-state"><Icon name="discover" /><h3>No stocks match this view.</h3><p>{category === 'aligned' && !data?.market ? 'The market regime is unavailable, so timeframe alignment cannot be confirmed.' : 'Try another setup, sector or price range.'}</p><button className="btn-glass" onClick={() => { setCategory('all'); setRange(ANY_PRICE); setSector('all'); setQuery(''); }}>Reset filters</button></div>}
    {sorted.length > limit && <button className="btn-glass" onClick={() => setLimit(n => n + 30)}>Show 30 more · {sorted.length - limit} remaining</button>}
    {data && <div className="scan-footer"><span>{sorted.length} matching · {data.scanned} scored · {data.failed ?? 0} unavailable · liquid NSE universe</span><DataStatus at={data.generatedAt} /></div>}
    <details className="research-disclosure" onToggle={e => setHistory(e.currentTarget.open)}><summary>Historical ranking <span>The existing past-year win-rate list</span></summary>{history && <SpecialList onSelect={onSelect} />}</details>
  </div>;
}

export function ScanSkeleton() {
  return <div className="scan-skeleton" role="status" aria-label="Loading the stock scan"><p>Preparing the research universe. A cold scan can take a few minutes.</p>{[0, 1, 2, 3].map(n => <div className="skeleton-row" key={n}><span /><span /><span /></div>)}</div>;
}
