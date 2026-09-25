'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { AnalyzeResponse } from '@/lib/types';
import type { Timeframe } from '@/lib/timeframes';
import VerdictCard from './VerdictCard';
import TimeframeTabs from './TimeframeTabs';
import ActionCard from './ActionCard';
import WeeklyContext from './WeeklyContext';
import SignalList from './SignalList';
import TradePlanCard from './TradePlanCard';
import Collapsible from './Collapsible';
import NewsPanel from './NewsPanel';
import AlertControls from './AlertControls';
import MoneyCheck from './MoneyCheck';
import { AnalystPanel, FundamentalsPanel, KeyMetrics, LevelsPanel, RiskPanel, StockHeader } from './StatsPanels';
const PriceChart = dynamic(() => import('./PriceChart'), { loading: () => <div className="h-80 skeleton-row" role="status">Loading price chart</div> });
const LiveChart = dynamic(() => import('./LiveChart'));
const BacktestPanel = dynamic(() => import('./BacktestPanel'));

export default function Report({ data, refreshKey }: { data: AnalyzeResponse; refreshKey: number }) {
  const { analysis, company, timeframes } = data;
  const [horizon, setHorizon] = useState<Timeframe>('short');
  const active = timeframes[horizon];
  useEffect(() => { document.querySelector<HTMLElement>('#report-region h1')?.focus(); }, [company.profile.symbol]);

  return (
    <div className="mt-6 space-y-5 animate-fade-up">
      <StockHeader key={`${company.profile.symbol}:${data.generatedAt}`} company={company} />
      {data.match.switchedFrom && <p className="notice">The source returned insufficient history for {data.match.switchedFrom}. This report uses {company.profile.symbol} on NSE for both price and analysis.</p>}

      {/* One stock, three horizons. The tabs preview each verdict so agreement
          (or disagreement) between timeframes is visible at a glance. */}
      <TimeframeTabs timeframes={timeframes} active={horizon} onChange={setHorizon} />
      <VerdictCard tf={active} />
      <p className="report-summary">{active.summary}</p>

      {horizon === 'short' && <Collapsible title="Expanded read" subtitle={data.narrative.source === 'ollama' ? 'AI-written, unverified explanation; figures come from the deterministic engine' : 'Rule-based explanation'}><Narrative text={data.narrative.text} source={data.narrative.source} /></Collapsible>}

      {horizon !== 'long' && <WeeklyContext weekly={analysis.weekly} />}

      <Collapsible title="Intraday context" subtitle="Yahoo delayed prices; refresh frequency is not data freshness"><LiveChart key={company.profile.symbol} symbol={company.profile.symbol} fallbackPrice={company.quote.price} /></Collapsible>

      <PriceChart bars={data.bars} levels={analysis.levels} plan={active.tradePlan} />
      <SignalList signals={active.signals} score={active.score} timeframe={horizon} />

      {active.tradePlan ? (
        <TradePlanCard plan={active.tradePlan} verdict={active.verdict} price={company.quote.price} />
      ) : (
        <ActionCard action={active.action} />
      )}

      <Collapsible title="Position sizing & scenario" subtitle="Model capital at risk; actual losses can exceed a stop">
      <MoneyCheck
        price={company.quote.price}
        plan={active.tradePlan}
        verdict={active.verdict}
        timeframe={horizon}
      />
      </Collapsible>

      <RiskPanel flags={active.riskFlags} />

      <Collapsible
        title="Latest news"
        subtitle="What may be moving the price — the context the chart can't show"
        defaultOpen
      >
        <NewsPanel company={company.profile.name} refreshKey={refreshKey} />
      </Collapsible>

      <Collapsible
        title="Price alerts"
        subtitle="Define a delayed-data condition and review exactly what triggers it"
      >
        <AlertControls symbol={company.profile.symbol} name={company.profile.name} />
      </Collapsible>


      <Collapsible
        title="Backtest — has the short-term engine worked before?"
        subtitle="The swing engine replayed over available history, with assumed costs"
      >
        <BacktestPanel query={company.profile.symbol} />
      </Collapsible>

      {/* Everything below is context rather than decision input, so it starts
          collapsed — the report is long enough without it open by default. */}
      <Collapsible title="Key numbers" subtitle="Momentum, volatility and range at a glance">
        <div className="p-4">
          <KeyMetrics snapshot={analysis.snapshot} levels={analysis.levels} company={company} />
        </div>
      </Collapsible>

      <Collapsible title="Support & resistance" subtitle="Swing highs and lows, nearest first">
        <LevelsPanel levels={analysis.levels} price={company.quote.price} bare />
      </Collapsible>

      <Collapsible title="Analyst consensus" subtitle="Sell-side views on a 12-month horizon">
        <div className="p-1">
          <AnalystPanel a={company.analyst} price={company.quote.price} bare />
        </div>
      </Collapsible>

      <Collapsible
        title="Fundamentals"
        subtitle="These drive the long-term score; the short & mid engines ignore them"
      >
        <FundamentalsPanel f={company.fundamentals} bare />
      </Collapsible>

      {company.profile.summary && (
        <Collapsible title="About the company">
          <p className="px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
            {company.profile.summary}
          </p>
        </Collapsible>
      )}

      <Disclaimer generatedAt={data.generatedAt} />
    </div>
  );
}

function Narrative({ text, source }: { text: string; source: 'template' | 'ollama' }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">The read</h2>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          {source === 'ollama' ? 'AI written · unverified' : 'Rule based'}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {text.split('\n\n').map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-[var(--muted)]">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}


function Disclaimer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="rounded-xl border border-[var(--border)] px-5 py-4 text-xs leading-relaxed text-[var(--muted)]">
      <p>
        <strong className="text-[var(--foreground)]">
          Educational tool, not investment advice.
        </strong>{' '}
        NIVRA applies fixed rules — technical for the short and mid-term views, fundamental for
        the long-term one — to publicly available data. It does not know your financial situation,
        and it cannot see news, results, or corporate actions that have not yet reached the price.
        No one can predict a future price — the levels shown are volatility-derived risk boundaries,
        not forecasts. Nothing here is a recommendation from a SEBI-registered research analyst.
      </p>
      <p className="mt-2">
        Price data via Yahoo Finance, which may be delayed. Generated{' '}
        {new Date(generatedAt).toLocaleString('en-IN')}.
      </p>
    </footer>
  );
}
