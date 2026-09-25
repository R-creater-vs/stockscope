'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import AppHeader, { NAV, type View } from '@/components/AppHeader';
import SearchBar from '@/components/SearchBar';
import MarketOverview from '@/components/MarketOverview';
import Discover from '@/components/Discover';
import { OfflineNotice } from '@/components/DataStatus';
import Icon from '@/components/Icon';
import { useWatchlist } from '@/lib/useWatchlist';
import { useScreen } from '@/lib/useScreen';
import type { AnalyzeResponse } from '@/lib/types';

const Report = dynamic(() => import('@/components/Report'), { loading: () => <ReportSkeleton /> });
const Watchlist = dynamic(() => import('@/components/Watchlist'));
const AlertsTab = dynamic(() => import('@/components/AlertsTab'));
const StrategyStudy = dynamic(() => import('@/components/StrategyStudy'));

const TITLES: Record<View, [string, string, string]> = {
  overview: ['THE BIG PICTURE', 'Clarity before your next move.', 'Understand the setup. See the risk. Decide with clarity.'],
  discover: ['FIND YOUR NEXT RESEARCH', 'Less noise. More context.', 'Search NSE and BSE names, or explore the liquid NSE scan below.'],
  watchlist: ['YOUR PERSONAL RADAR', 'Keep perspective on your list.', 'Monitor changing scores, price moves and the rules you are watching.'],
  alerts: ['MONITOR WITH INTENTION', 'Know what you’re waiting for.', 'Clear conditions. Useful context. Notifications on your terms.'],
  strategy: ['QUESTION THE EVIDENCE', 'The model has to earn your trust.', 'Inspect the historical record, assumptions and limits of every engine.'],
};

export default function Home() {
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reportSearch, setReportSearch] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const { items: watched } = useWatchlist();
  const screen = useScreen();
  const heading = useRef<HTMLHeadingElement>(null);

  const analyse = useCallback(async (query: string, opts?: { silent?: boolean; history?: boolean }) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const silent = opts?.silent ?? false;
    if (silent) setRefreshing(true);
    else { setLoading(true); setRefreshing(false); setReportSearch(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
    setError(null);
    if (!silent && opts?.history !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set('symbol', query); url.searchParams.delete('auth');
      window.history.pushState({}, '', url);
    }
    try {
      const res = await fetch(`/api/analyze?q=${encodeURIComponent(query)}${silent ? '&fresh=1' : ''}`, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The report could not be loaded.');
      if (controller.signal.aborted) return;
      setData(json);
      if (silent) setRefreshKey(k => k + 1);
      else requestAnimationFrame(() => document.querySelector<HTMLElement>('#report-region h1')?.focus());
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Could not reach the server. Check your connection and try again.');
      if (!silent) setData(null);
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const navigate = useCallback((next: View) => {
    request.current?.abort(); setData(null); setError(null); setLoading(false); setRefreshing(false); setReportSearch(false); setView(next);
    window.history.pushState({}, '', `/?view=${next}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => heading.current?.focus());
  }, []);

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('view');
      if (NAV.some(n => n.id === next)) setView(next as View);
      else setView('overview');
      const symbol = params.get('symbol');
      if (symbol) void analyse(symbol, { history: false });
      else { request.current?.abort(); setData(null); setError(null); setLoading(false); setRefreshing(false); }
      const auth = params.get('auth');
      if (auth) {
        setAuthMessage(auth === 'success' ? 'Signed in. Your watchlist and alerts are synced to your account.' : auth === 'setup' ? 'Sign-in is not available on this deployment. Your device workspace is still available.' : 'Sign-in did not complete. You can try again from the account menu.');
        params.delete('auth'); window.history.replaceState({}, '', `/?${params}`);
      }
    };
    const timer = setTimeout(sync, 0);
    window.addEventListener('popstate', sync);
    return () => { clearTimeout(timer); window.removeEventListener('popstate', sync); request.current?.abort(); };
  }, [analyse]);

  const symbol = data?.company.profile.symbol;
  useEffect(() => {
    if (!symbol) return;
    const refresh = () => { if (!document.hidden && !refreshing && !loading) void analyse(symbol, { silent: true }); };
    const timer = setInterval(refresh, 180_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [symbol, analyse, refreshing, loading]);

  const showingReport = Boolean(data) && !loading;
  const title = TITLES[view];
  return <>
    <AppHeader view={view} report={showingReport || loading} count={watched.length} onNavigate={navigate} />
    <main id="main" className="workspace" tabIndex={-1}>
      <OfflineNotice />
      {authMessage && <div className="notice" role="status"><span>{authMessage}</span><button onClick={() => setAuthMessage(null)} aria-label="Dismiss sign-in message"><Icon name="close" /></button></div>}
      {!showingReport && !loading && <div className="page-heading"><span className="eyebrow">{title[0]}</span><h1 ref={heading} tabIndex={-1}>{title[1]}</h1><p>{title[2]}</p></div>}
      {(showingReport || loading) && <div className="report-toolbar"><button className="btn-glass" onClick={() => navigate(view)}>← Back to {view === 'strategy' ? 'evidence' : view}</button><div><button className="btn-glass" aria-label="Search another company" aria-expanded={reportSearch} aria-controls="workspace-search" onClick={() => setReportSearch(open => !open)}><Icon name="search" /></button>{data && <><span className="fine-print">Report computed {new Date(data.generatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST</span><button className="btn-glass" disabled={refreshing || loading} onClick={() => void analyse(data.company.profile.symbol, { silent: true })}><Icon name="refresh" />{refreshing ? 'Refreshing' : 'Refresh'}</button></>}</div></div>}
      <div id="workspace-search" hidden={(showingReport || loading) && !reportSearch} className={`workspace-search ${view !== 'discover' || showingReport || loading ? 'compact-search' : ''}`}><SearchBar onSelect={analyse} loading={loading} /></div>
      {error && <div className="notice" role="alert"><span>{error} {data && 'The previous report is still shown; it may be stale.'}</span><button onClick={() => { const q = new URLSearchParams(window.location.search).get('symbol'); if (q) void analyse(q, { history: false, silent: Boolean(data) }); }}>Try again</button></div>}
      {loading && <ReportSkeleton />}
      <div hidden={showingReport || loading}>
        {view === 'overview' && <MarketOverview {...screen} onSelect={analyse} onDiscover={() => navigate('discover')} onEvidence={() => navigate('strategy')} />}
        <div hidden={view !== 'discover'}><Discover {...screen} onSelect={analyse} /></div>
        {view === 'watchlist' && <Watchlist active={!showingReport && !loading} onSelect={analyse} onDiscover={() => navigate('discover')} />}
        {view === 'alerts' && <AlertsTab onSelect={analyse} onDiscover={() => navigate('discover')} />}
        {view === 'strategy' && <StrategyStudy />}
      </div>
      {showingReport && data && <div id="report-region"><Report key={data.company.profile.symbol} data={data} refreshKey={refreshKey} /></div>}
      <footer className="workspace-footer"><span>NIVRA <span aria-hidden="true">/</span> Clarity is the advantage.</span><p>Educational research, not investment advice. Delayed data. No order execution. Research is not a recommendation from a SEBI-registered analyst.</p><button onClick={() => navigate('strategy')}>Read the evidence <Icon name="arrow" /></button></footer>
    </main>
  </>;
}

function ReportSkeleton() {
  return <div className="report-skeleton" role="status" aria-label="Loading stock intelligence report"><p>Building the report from price history and company data…</p><div /><div /><div /><div /></div>;
}
