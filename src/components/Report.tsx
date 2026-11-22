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
const BacktestPanel = dynamic(() => import('./BacktestPanel'), { loading: () => <p className="p-5 text-sm text-[var(--muted)]" role="status">Opening history check…</p> });
const PositionBrief = dynamic(() => import('./PositionBrief'), { loading: () => <p className="rounded-xl border border-[var(--border)] p-5 text-sm text-[var(--muted)]" role="status">Loading weeks-to-months evidence…</p> });

const HORIZON_KEY = 'nivra.reportHorizon';

/** The last timeframe this viewer chose. A per-browser convenience; it is never required. */
function readHorizon(): Timeframe {
  try {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(HORIZON_KEY);
    return stored === 'mid' || stored === 'long' || stored === 'short' ? stored : 'short';
  } catch {
    return 'short';
  }
}

const HISTORY_PROMPT: Record<Timeframe, [string, string]> = {
  short: ['How did this strategy perform on this stock?', 'Check past trades, losses and assumed costs.'],
  mid: ['How did the short-term rules perform on this stock?', 'The per-stock history check replays the short-term (swing) rules only. The mid-term engine is covered by the stored universe study summarised in the weeks-to-months evidence above and in Strategy evidence.'],
  long: ['How did the short-term rules perform on this stock?', 'The per-stock history check replays the short-term (swing) rules only. The long-term fundamental score cannot be replayed without point-in-time fundamentals.'],
};

const REPORT_SECTIONS = [
  ['summary', 'Summary'],
  ['price', 'Price chart'],
  ['signals', 'Why this score'],
  ['risk', 'Risk & plan'],
  ['history', 'History check'],
  ['company', 'Company'],
] as const;

export default function Report({ data, refreshKey }: { data: AnalyzeResponse; refreshKey: number }) {
  const { analysis, company, timeframes } = data;
  const [horizon, setHorizonState] = useState<Timeframe>(readHorizon);
  const [historyStarted, setHistoryStarted] = useState(false);
  const setHorizon = (next: Timeframe) => {
    setHorizonState(next);
    try { window.localStorage.setItem(HORIZON_KEY, next); } catch { /* Storage can be unavailable; the choice still applies now. */ }
  };
  const active = timeframes[horizon];
  useEffect(() => { document.querySelector<HTMLElement>('#report-region h1')?.focus(); }, [company.profile.symbol]);

  function goToSection(section: string) {
    const target = document.getElementById(`report-${section}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }

  function runHistory() {
    setHistoryStarted(true);
    goToSection('history');
  }

  return (
    <div className="mt-6 space-y-5 animate-fade-up">
      <StockHeader key={`${company.profile.symbol}:${data.generatedAt}`} company={company} />
      {data.match.switchedFrom && <p className="notice">The source returned insufficient history for {data.match.switchedFrom}. This report uses {company.profile.symbol} on NSE for both price and analysis.</p>}

      <nav aria-label="Stock report sections" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {REPORT_SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => goToSection(id)} className="min-h-11 rounded-lg border border-[var(--border)] px-2 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]">{label}</button>)}
      </nav>

      <section id="report-summary" tabIndex={-1} aria-label="Stock summary" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">The quick read</h2>
        <label className="flex w-full min-w-0 items-center gap-2 text-sm text-[var(--muted)] sm:w-auto">Timeframe
          <select value={horizon} onChange={(event) => setHorizon(event.target.value as Timeframe)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]">
            {(['short', 'mid', 'long'] as const).map((id) => <option key={id} value={id}>{timeframes[id].label} · {timeframes[id].horizon}</option>)}
          </select>
        </label>
      </div>
      <VerdictCard tf={active} />
      {horizon === 'long' && company.dataStatus?.fundamentals === 'unavailable' && <p className="notice">Some fundamentals are unavailable, so this long-term assessment may be incomplete. Refresh the report to try again.</p>}
      <p className="report-summary">{active.summary}</p>

      {horizon === 'mid' ? (
        data.position ? (
          <PositionBrief position={data.position} company={company} mid={timeframes.mid} refreshKey={refreshKey} />
        ) : (
          <p className="notice">Weeks-to-months evidence is unavailable for this report: it could not be computed, or the report was cached before it existed. Refresh the report to try again. The mid-term score above is unaffected.</p>
        )
      ) : (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Holding for weeks to months?</p>
            <p className="mt-1 text-sm text-[var(--muted)]">The mid-term view adds market and sector trend, relative strength, dated patterns, fundamentals context, news and position risks, each with its rule and source date.</p>
          </div>
          <button type="button" onClick={() => setHorizon('mid')} className="btn-glass shrink-0">View weeks-to-months evidence</button>
        </div>
      )}

      <div className="flex flex-col items-start justify-between gap-3 border-y border-[var(--border)] py-4 sm:flex-row sm:items-center">
        <div><p className="text-sm font-semibold">{HISTORY_PROMPT[horizon][0]}</p><p className="mt-1 text-sm text-[var(--muted)]">{HISTORY_PROMPT[horizon][1]}</p></div>
        <button type="button" onClick={runHistory} className="min-h-11 shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">{historyStarted ? 'View history check' : 'Run history check'}</button>
      </div>

      {horizon === 'short' && <Collapsible title="Expanded read" subtitle={data.narrative.source === 'ollama' ? 'AI-written, unverified explanation; figures come from the deterministic engine' : 'Rule-based explanation'}><Narrative text={data.narrative.text} source={data.narrative.source} /></Collapsible>}

      <Collapsible title="Compare timeframes" subtitle="See where the short, mid and long-term views agree"><div className="p-4"><TimeframeTabs timeframes={timeframes} active={horizon} onChange={setHorizon} /></div></Collapsible>

      {horizon !== 'long' && <Collapsible title="Does the weekly trend agree?" subtitle="A wider view of the same stock"><WeeklyContext weekly={analysis.weekly} /></Collapsible>}
      </section>

      <section id="report-price" tabIndex={-1} aria-label="Price chart" className="scroll-mt-6 space-y-4">
      <PriceChart bars={data.bars} levels={analysis.levels} plan={active.tradePlan} />
      <Collapsible title="Today's price movement" subtitle="Yahoo delayed prices; refresh frequency is not data freshness"><LiveChart key={company.profile.symbol} symbol={company.profile.symbol} fallbackPrice={company.quote.price} /></Collapsible>
      </section>

      <section id="report-signals" tabIndex={-1} aria-label="Why this score" className="scroll-mt-6">
      <SignalList signals={active.signals} score={active.score} timeframe={horizon} />
      </section>

      <section id="report-risk" tabIndex={-1} aria-label="Risk and trade plan" className="scroll-mt-6 space-y-4">
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

      <Collapsible title="Price alerts" subtitle="Choose a condition to monitor for this stock">
        <AlertControls symbol={company.profile.symbol} name={company.profile.name} />
      </Collapsible>
      </section>

      <section id="report-history" tabIndex={-1} aria-labelledby="report-history-title" className="scroll-mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-5 py-4">
          <h2 id="report-history-title" className="text-lg font-semibold">History check</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Replay the short-term strategy over this stock&apos;s available history. Past performance does not predict future returns.</p>
        </header>
        {historyStarted ? <BacktestPanel key={company.profile.symbol} query={company.profile.symbol} autoRun /> : <div className="p-5"><p className="mb-4 text-sm text-[var(--muted)]">See the number of trades, win rate, largest decline and returns after assumed costs. The first check can take longer on a phone; elapsed time is shown while it runs.</p><button type="button" onClick={runHistory} className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Run history check</button></div>}
      </section>

      <section id="report-company" tabIndex={-1} aria-labelledby="report-company-title" className="scroll-mt-6 space-y-4">
      <div><h2 id="report-company-title" className="text-lg font-semibold">Company & deeper research</h2><p className="mt-1 text-sm text-[var(--muted)]">News, business details and the numbers behind the report.</p></div>
      {company.dataStatus?.fundamentals === 'unavailable' && <p className="notice">{company.dataStatus.message ?? 'Company details did not arrive in time. The report still shows available price history and technical analysis; unavailable figures are left blank.'}</p>}

      <Collapsible
        title="Latest news"
        subtitle="What may be moving the price — the context the chart can't show"
      >
        <NewsPanel company={company.profile.name} symbol={company.profile.symbol} refreshKey={refreshKey} />
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
      </section>

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
