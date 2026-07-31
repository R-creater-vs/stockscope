'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SearchBar from '@/components/SearchBar';
import Discover from '@/components/Discover';
import Watchlist from '@/components/Watchlist';
import StrategyStudy from '@/components/StrategyStudy';
import AlertsTab from '@/components/AlertsTab';
import AlertControls from '@/components/AlertControls';
import SpecialList from '@/components/SpecialList';
import AppHeader from '@/components/AppHeader';
import RegimeBanner from '@/components/RegimeBanner';
import { useWatchlist } from '@/lib/useWatchlist';
import VerdictCard from '@/components/VerdictCard';
import TimeframeTabs from '@/components/TimeframeTabs';
import ActionCard from '@/components/ActionCard';
import WeeklyContext from '@/components/WeeklyContext';
import SignalList from '@/components/SignalList';
import PriceChart from '@/components/PriceChart';
import TradePlanCard from '@/components/TradePlanCard';
import Collapsible from '@/components/Collapsible';
import NewsPanel from '@/components/NewsPanel';
import BacktestPanel from '@/components/BacktestPanel';
import LiveChart from '@/components/LiveChart';
import MoneyCheck from '@/components/MoneyCheck';
import type { Timeframe } from '@/lib/timeframes';
import {
  AnalystPanel,
  FundamentalsPanel,
  KeyMetrics,
  LevelsPanel,
  RiskPanel,
  StockHeader,
} from '@/components/StatsPanels';
import type { AnalyzeResponse } from '@/lib/types';

type HomeTab = 'discover' | 'special' | 'watchlist' | 'alerts' | 'strategy';

export default function Home() {
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HomeTab>('discover');
  const { items: watched, ready: watchReady } = useWatchlist();

  const goHome = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  /**
   * `silent` is the refresh path: it keeps the current report on screen (no
   * skeleton, no scroll) and adds ?fresh=1 so the server bypasses its caches and
   * genuinely re-pulls price, bars, analysis and news. A bumped refreshKey tells
   * the independently-fetching panels (news) to reload too.
   */
  const analyse = useCallback(async (query: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/analyze?q=${encodeURIComponent(query)}${silent ? '&fresh=1' : ''}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.');
        if (!silent) setData(null); // a failed refresh keeps the last good report
      } else {
        setData(json as AnalyzeResponse);
        if (silent) setRefreshKey((k) => k + 1);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      if (!silent) setData(null);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (data) analyse(data.company.profile.symbol, { silent: true });
  }, [data, analyse]);

  const showingReport = Boolean(data) && !loading;

  // Keep an open report live: silently re-pull EVERYTHING — price, chart, news,
  // verdict, signals — every few minutes, and the instant the app returns to the
  // foreground (the phone case: you reopen it and it's already fresh). Paused
  // while the tab is hidden so it isn't fetching in your pocket. Refs hold the
  // latest refresh fn/flag so the interval keeps the same symbol without resetting.
  const refreshRef = useRef(refresh);
  const refreshingRef = useRef(refreshing);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  const openSymbol = showingReport && data ? data.company.profile.symbol : undefined;
  useEffect(() => {
    if (!openSymbol) return;
    const AUTO_MS = 180_000; // 3 minutes — daily-bar analysis; news is what moves
    const tick = () => {
      if (!document.hidden && !refreshingRef.current) refreshRef.current();
    };
    const id = setInterval(tick, AUTO_MS);
    // Refresh immediately when the app/tab comes back to the foreground.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [openSymbol]);

  return (
    <>
      <AppHeader onHome={goHome} />
      <RegimeBanner />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 sm:py-9">
        <AuthBanner />

        {showingReport && (
          <div className="mb-5 flex items-center justify-between gap-3">
            <button onClick={goHome} className="btn-glass text-xs text-[var(--muted)]">
              <span aria-hidden>←</span> Back to discover
            </button>
            <div className="flex items-center gap-3">
              {data && (
                <span
                  className="hidden items-center gap-1.5 text-[11px] text-[var(--muted-2)] sm:flex"
                  title="This report auto-updates every few minutes and whenever you reopen the app"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--bull)] opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--bull)]" />
                  </span>
                  {refreshing ? 'Updating…' : `Auto-updated ${new Date(data.generatedAt).toLocaleTimeString('en-IN')}`}
                </span>
              )}
              <button
                onClick={refresh}
                disabled={refreshing}
                className="btn-glass text-xs disabled:opacity-50"
                title="Re-pull the price, chart, analysis and news for this stock"
              >
                <svg
                  className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.5 5.5A6.5 6.5 0 103.7 11.5M15.5 3v3h-3"
                  />
                </svg>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        )}

        {/* Hero — only on the home view, above the search. */}
        {!showingReport && !loading && (
          <div className="mb-7 animate-fade-up">
            <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]">
              <span className="gradient-hero">Analyze any Indian stock,</span>
              <br className="hidden sm:block" />
              <span className="text-[var(--foreground)]"> in one clear read.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-[var(--muted)] sm:text-[15px]">
              Short, mid and long-term verdicts on every NSE name — signals, levels, live news and a
              backtested track record, so you always know how much to trust the call.
            </p>
          </div>
        )}

        <SearchBar onSelect={analyse} loading={loading} />

        {error && (
          <div className="mt-6 rounded-xl border border-[var(--bear)]/40 bg-[var(--bear)]/5 px-5 py-4 text-sm">
            {error}
          </div>
        )}

        {loading && <ReportSkeleton />}

        {/* Home view stays mounted while a report is open so returning doesn't re-scan. */}
        <div className={showingReport || loading ? 'hidden' : undefined}>
          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
            <Tab active={tab === 'discover'} onClick={() => setTab('discover')}>
              Suggestions
            </Tab>
            <Tab active={tab === 'special'} onClick={() => setTab('special')}>
              ★ Special list
            </Tab>
            <Tab active={tab === 'watchlist'} onClick={() => setTab('watchlist')}>
              Watchlist
              {watchReady && watched.length > 0 && (
                <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {watched.length}
                </span>
              )}
            </Tab>
            <Tab active={tab === 'alerts'} onClick={() => setTab('alerts')}>
              Alerts
            </Tab>
            <Tab active={tab === 'strategy'} onClick={() => setTab('strategy')}>
              Strategy check
            </Tab>
          </div>

          <div className={tab === 'discover' ? undefined : 'hidden'}>
            <Discover onSelect={analyse} />
          </div>
          {tab === 'special' && <SpecialList onSelect={analyse} />}
          {tab === 'watchlist' && <Watchlist onSelect={analyse} />}
          {tab === 'alerts' && <AlertsTab onSelect={analyse} />}
          {tab === 'strategy' && <StrategyStudy />}
        </div>

        {showingReport && data && <Report data={data} refreshKey={refreshKey} />}
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Feedback after an OAuth round-trip. The callback redirects to /?auth=<status>;
 * we surface it, then scrub the query string so a refresh doesn't repeat it.
 */
function AuthBanner() {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('auth');
    if (!status) return;
    const map: Record<string, { tone: 'ok' | 'warn' | 'bad'; text: string }> = {
      success: { tone: 'ok', text: 'Signed in — your watchlist and alerts are now synced to your account.' },
      error: { tone: 'bad', text: "Sign-in didn't complete. Please try again." },
      setup: {
        tone: 'warn',
        text: 'Google sign-in isn’t configured on this deployment yet. See the README to enable it.',
      },
    };
    const next = map[status];
    if (next) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the OAuth redirect status on mount
      setMsg(next);
      const t = setTimeout(() => setMsg(null), 7000);
      window.history.replaceState({}, '', '/');
      return () => clearTimeout(t);
    }
  }, []);

  if (!msg) return null;
  const tone =
    msg.tone === 'ok'
      ? 'border-[var(--bull)]/40 bg-[var(--bull)]/8 text-[var(--bull)]'
      : msg.tone === 'warn'
        ? 'border-[var(--warn)]/40 bg-[var(--warn)]/8 text-[var(--warn)]'
        : 'border-[var(--bear)]/40 bg-[var(--bear)]/8 text-[var(--bear)]';

  return (
    <div
      className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-up ${tone}`}
    >
      <span>{msg.text}</span>
      <button onClick={() => setMsg(null)} className="shrink-0 opacity-70 transition hover:opacity-100">
        ✕
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-[var(--accent)] text-[var(--foreground)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
      }`}
    >
      {children}
    </button>
  );
}

function Report({ data, refreshKey }: { data: AnalyzeResponse; refreshKey: number }) {
  const { analysis, company, timeframes } = data;
  const [horizon, setHorizon] = useState<Timeframe>('short');
  const active = timeframes[horizon];

  return (
    <div className="mt-6 space-y-5 animate-fade-up">
      <StockHeader key={company.profile.symbol} company={company} />

      {/* One stock, three horizons. The tabs preview each verdict so agreement
          (or disagreement) between timeframes is visible at a glance. */}
      <TimeframeTabs timeframes={timeframes} active={horizon} onChange={setHorizon} />
      <VerdictCard tf={active} />

      {horizon === 'short' ? (
        <Narrative text={data.narrative.text} source={data.narrative.source} />
      ) : (
        <TimeframeRead summary={active.summary} />
      )}

      {horizon !== 'long' && <WeeklyContext weekly={analysis.weekly} />}

      <LiveChart key={company.profile.symbol} symbol={company.profile.symbol} fallbackPrice={company.quote.price} />

      <PriceChart bars={data.bars} levels={analysis.levels} plan={active.tradePlan} />

      {active.tradePlan ? (
        <TradePlanCard plan={active.tradePlan} verdict={active.verdict} price={company.quote.price} />
      ) : (
        <ActionCard action={active.action} />
      )}

      <MoneyCheck
        price={company.quote.price}
        plan={active.tradePlan}
        verdict={active.verdict}
        timeframe={horizon}
      />

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
        subtitle="Get notified when this stock breaks out, breaks its stop, or moves — tab closed or not"
      >
        <AlertControls symbol={company.profile.symbol} name={company.profile.name} />
      </Collapsible>

      <SignalList signals={active.signals} />

      <Collapsible
        title="Backtest — has the short-term engine worked before?"
        subtitle="The swing engine replayed over 3 years of this stock's history, net of costs"
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

/** The read for mid/long horizons — a deterministic summary, no LLM involved. */
function TimeframeRead({ summary }: { summary: string }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">The read</h2>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Rule based
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{summary}</p>
    </section>
  );
}

function Narrative({ text, source }: { text: string; source: 'template' | 'ollama' }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">The read</h2>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          {source === 'ollama' ? 'AI written' : 'Rule based'}
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

function ReportSkeleton() {
  return (
    <div className="mt-6 space-y-5">
      <div className="h-16 animate-pulse rounded-xl bg-[var(--surface)]" />
      <div className="h-40 animate-pulse rounded-xl bg-[var(--surface)]" />
      <div className="h-32 animate-pulse rounded-xl bg-[var(--surface)]" />
      <div className="h-80 animate-pulse rounded-xl bg-[var(--surface)]" />
    </div>
  );
}

function Disclaimer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="rounded-xl border border-[var(--border)] px-5 py-4 text-xs leading-relaxed text-[var(--muted)]">
      <p>
        <strong className="text-[var(--foreground)]">
          Educational tool, not investment advice.
        </strong>{' '}
        StockScope applies fixed rules — technical for the short and mid-term views, fundamental for
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
