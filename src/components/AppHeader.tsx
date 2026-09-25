'use client';
import AccountMenu from './AccountMenu';
import Icon, { type IconName } from './Icon';

export type View = 'overview' | 'discover' | 'watchlist' | 'alerts' | 'strategy';
export const NAV: { id: View; label: string; icon: IconName; index: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview', index: '01' },
  { id: 'discover', label: 'Discover', icon: 'discover', index: '02' },
  { id: 'watchlist', label: 'Watchlist', icon: 'watchlist', index: '03' },
  { id: 'alerts', label: 'Alerts', icon: 'alerts', index: '04' },
  { id: 'strategy', label: 'Evidence', icon: 'evidence', index: '05' },
];

export function BrandMark({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M5 5H27V11H11V19H5Z M27 27H5V21H21V13H27Z" /></svg>;
}

export default function AppHeader({ view, report, count, onNavigate }: { view: View; report: boolean; count: number; onNavigate: (view: View) => void }) {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate('overview')} aria-label="NIVRA market overview"><BrandMark /><span>NIVRA<span className="brand-caption">MARKET INTELLIGENCE</span></span></button>
      <div className="rail-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation" className="desktop-nav">{NAV.map(item => <a key={item.id} href={`/?view=${item.id}`} onClick={e => { e.preventDefault(); onNavigate(item.id); }} aria-current={!report && view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'watchlist' && count > 0 ? <span className="nav-count">{count}</span> : <span className="nav-index">{item.index}</span>}</a>)}</nav>
      <div className="rail-bottom"><div className="rail-note"><Icon name="signal" /><p>Understand the setup.<br />See the risk.<br /><span>Decide with clarity.</span></p></div><span className="rail-foot">NSE / BSE RESEARCH<span>Provisional brand · NIVRA</span></span></div>
    </aside>
    <header className="topbar safe-top">
      <button className="brand mobile-brand" onClick={() => onNavigate('overview')} aria-label="NIVRA market overview"><BrandMark size={28} /><span>NIVRA</span></button>
      <div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{report ? 'Stock intelligence' : NAV.find(n => n.id === view)?.label}</strong></div>
      <div className="topbar-end"><span className="research-pill">RESEARCH, WITH PERSPECTIVE</span><AccountMenu /></div>
    </header>
    <nav className="mobile-nav" aria-label="Mobile navigation">{NAV.map(item => <a key={item.id} href={`/?view=${item.id}`} onClick={e => { e.preventDefault(); onNavigate(item.id); }} aria-current={!report && view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span></a>)}</nav>
  </>;
}
