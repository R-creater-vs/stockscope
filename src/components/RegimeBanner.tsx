'use client';
import { useEffect, useState } from 'react';
import type { MarketContext } from '@/lib/screenAggregate';
import { num, pct } from '@/lib/format';
import Icon from './Icon';

const READ = {
  Bullish: ['An upward bias.', 'The Nifty daily trend leans upward. Assess each setup and its downside independently.'],
  Neutral: ['A mixed market.', 'The Nifty trend is unresolved. Signals need context; a score alone is not a reason to act.'],
  Bearish: ['A defensive backdrop.', 'The Nifty daily trend leans downward. Long setups face a conflicting market backdrop.'],
};

export default function RegimeBanner() {
  const [market, setMarket] = useState<MarketContext | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [marketState, setMarketState] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/market');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.market) { setState('error'); return; }
        setMarket(json.market); setState('ready'); setReceivedAt(new Date().toISOString());
      } catch { if (!cancelled) setState('error'); }
    };
    const quote = async () => {
      try {
        const res = await fetch('/api/quote?symbol=%5ENSEI');
        const json = await res.json();
        if (!cancelled) setMarketState(res.ok ? json.marketState ?? null : null);
      } catch { if (!cancelled) setMarketState(null); }
    };
    void load(); void quote();
    const timer = setInterval(() => { if (!document.hidden) { void load(); void quote(); } }, 300_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [attempt]);
  const tone = market?.regime === 'Bullish' ? 'positive' : market?.regime === 'Bearish' ? 'negative' : 'neutral';
  const marketLabels: Record<string, string> = { REGULAR: 'Market open', PRE: 'Pre-market', PREPRE: 'Pre-market', POST: 'Post-market', POSTPOST: 'Market closed', CLOSED: 'Market closed' };
  const statusLabel = marketState ? `${marketLabels[marketState] ?? marketState} · provider status` : 'Market status unavailable';
  return <section className="regime-panel" aria-labelledby="regime-heading" aria-busy={state === 'loading'}>
    <div className="regime-top"><span className="eyebrow"><span className="section-index">01</span> THE MARKET BACKDROP</span><span className="market-status"><span aria-hidden="true">◷</span> {statusLabel}</span></div>
    <div className="regime-body">
      <div className="regime-read"><h2 id="regime-heading">{market ? READ[market.regime][0] : state === 'loading' ? 'Reading the market.' : 'The backdrop is unavailable.'}</h2><p>{market ? READ[market.regime][1] : 'Nifty regime uses daily price bars. Market data appears here only when the source responds.'}</p><div className={`regime-label ${tone}`}><Icon name="signal" />{market ? `${market.regime} regime` : state === 'loading' ? 'Loading Nifty regime' : 'No regime available'}</div></div>
      <div className="regime-numbers"><span className="eyebrow">NIFTY 50 <span className="normal-case">/ daily-bar close</span></span><div className="index-price tnum">{market ? num(market.price, 2) : '—'}</div><span className={`index-change tnum ${market && market.changePercent < 0 ? 'negative' : 'positive'}`}>{market ? `${pct(market.changePercent, 2, true)} from previous bar` : 'No price to display'}</span><div className="regime-axis" aria-label={market ? `Index ${market.above50 ? 'above' : 'below'} its 50-day exponential moving average` : 'Trend unavailable'}><span className={market?.regime === 'Bearish' ? 'selected' : ''}>Below trend</span><span className={market?.regime === 'Neutral' ? 'selected' : ''}>Mixed</span><span className={market?.regime === 'Bullish' ? 'selected' : ''}>Above trend</span></div></div>
    </div>
    <div className="regime-footer"><span>Yahoo Finance · delayed · {market?.sourceBarDate ? `daily bar ${market.sourceBarDate.slice(0, 10)}` : 'source bar date unavailable'}</span><span>{state === 'error' ? <button onClick={() => setAttempt(x => x + 1)}>Retry market data ↻</button> : receivedAt ? `Retrieved ${new Date(receivedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST · cached up to 5 min` : 'Waiting for source'}</span></div>
  </section>;
}
