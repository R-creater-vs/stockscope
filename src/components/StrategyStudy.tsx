'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AggregateStudy, Engine } from '@/lib/backtest';
import SignalBuckets from './SignalBuckets';

interface StudyResp {
  engine: Engine;
  isProxy: boolean;
  study: AggregateStudy;
  studyRegimeFiltered: AggregateStudy | null;
  generatedAt: string;
  durationMs: number;
}

const ENGINES: { id: Engine; label: string; blurb: string }[] = [
  { id: 'short', label: 'Short-term', blurb: 'The swing engine: momentum & breakouts.' },
  { id: 'mid', label: 'Mid-term', blurb: 'The trend-following engine: 50/200 regime & weekly trend.' },
  {
    id: 'long',
    label: 'Long-term',
    blurb: 'A price-trend proxy — the real engine is fundamental and cannot be backtested honestly (see below).',
  },
];

export default function StrategyStudy() {
  const [engine, setEngine] = useState<Engine>('short');
  // Cache each engine's result so switching tabs doesn't refetch or re-run.
  const [byEngine, setByEngine] = useState<Partial<Record<Engine, StudyResp>>>({});
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');

  const data = byEngine[engine] ?? null;

  // On selecting an engine with no result yet, ask only for a cached one — never
  // trigger the multi-minute run automatically. The user opts in.
  useEffect(() => {
    if (byEngine[engine]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/backtest-study?engine=${engine}&cachedOnly=1`);
        if (cancelled || res.status === 204 || !res.ok) return;
        const json = (await res.json()) as StudyResp;
        if (!cancelled) setByEngine((m) => ({ ...m, [engine]: json }));
      } catch {
        /* leave unloaded; the run button is the fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, byEngine]);

  const run = useCallback(async () => {
    setState('running');
    try {
      const res = await fetch(`/api/backtest-study?engine=${engine}`);
      const json = await res.json();
      if (!res.ok) setState('error');
      else {
        setByEngine((m) => ({ ...m, [engine]: json as StudyResp }));
        setState('idle');
      }
    } catch {
      setState('error');
    }
  }, [engine]);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Strategy check</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          An honest, point-in-time backtest of each engine across the whole NSE universe. The engine
          is replayed day by day — only ever seeing the past — with entries at the next day&apos;s
          open and costs deducted. This is where the app grades itself.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              onClick={() => setEngine(e.id)}
              aria-pressed={engine === e.id}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                engine === e.id
                  ? 'border-[var(--accent)] bg-[var(--surface-2)] font-medium'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{ENGINES.find((e) => e.id === engine)!.blurb}</p>

        {!data && state !== 'running' && (
          <button
            onClick={run}
            className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Run the {engine} study (~1–3 min, cached after)
          </button>
        )}
        {state === 'running' && (
          <div className="mt-4 flex items-center gap-3 text-sm text-[var(--muted)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Replaying ~130 stocks over 3 years…
          </div>
        )}
        {state === 'error' && (
          <p className="mt-4 text-sm text-[var(--bear)]">The study failed to run. Try again.</p>
        )}
      </div>

      {data && <Results data={data} />}
    </div>
  );
}

function Results({ data }: { data: StudyResp }) {
  const s = data.study;
  const corr = s.signal.correlation;
  const edge = s.trade.expectancyR;

  // "Works" needs BOTH a positive score→return correlation and a positive
  // trading expectancy. A contrarian (negative) correlation is flagged specially
  // — it means the score carries information, just inverted.
  const works = corr > 0.05 && edge > 0.03;
  const contrarian = corr < -0.05;
  const verdictColor = works ? 'var(--bull)' : contrarian ? 'var(--warn)' : 'var(--bear)';

  const headline = works
    ? 'This engine shows a positive edge.'
    : contrarian
      ? 'No edge as-built — but the score is inversely predictive.'
      : 'No reliable edge found.';

  return (
    <div className="space-y-5">
      {data.isProxy && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-5 py-4 text-sm text-[var(--muted)]">
          <strong className="text-[var(--warn)]">This is a proxy, not the real long-term engine.</strong>{' '}
          The long-term engine is driven by fundamentals (valuation, growth, quality), and Yahoo only
          exposes <em>today&apos;s</em> fundamentals — so replaying it over history would use
          information that did not exist at the time (look-ahead bias). What&apos;s tested here is a
          price-only trend proxy (200-day trend + momentum), which validates only the trend part of
          the long thesis. An honest fundamental backtest needs a point-in-time fundamentals dataset.
        </div>
      )}

      <div
        className="rounded-xl border p-5"
        style={{ borderColor: `${verdictColor}55`, background: `${verdictColor}12` }}
      >
        <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Verdict</p>
        <p className="mt-1 text-xl font-bold" style={{ color: verdictColor }}>
          {headline}
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {works
            ? `A higher score predicted a higher forward return (correlation ${corr.toFixed(2)}), with a positive expectancy of ${edge.toFixed(2)}R per trade across ${s.trade.trades.toLocaleString('en-IN')} trades.`
            : contrarian
              ? `Across ${s.symbolsTested} stocks and ${s.signal.samples.toLocaleString('en-IN')} samples, the score's correlation with the ${s.signal.horizon}-day forward return is ${corr.toFixed(3)} — negative. The lowest-scoring stocks went on to outperform the highest-scoring ones. In this universe of liquid large-caps, buying strength has been the wrong trade; the market mean-reverts. The score holds real information — it is simply pointed the wrong way.`
              : `Across ${s.symbolsTested} stocks and ${s.signal.samples.toLocaleString('en-IN')} samples the correlation is ${corr.toFixed(3)} — essentially none. Expectancy ${edge.toFixed(2)}R per trade (profit factor ${s.trade.profitFactor.toFixed(2)}).`}
        </p>
      </div>

      <Stats title="Take every signal" t={s} />
      {data.studyRegimeFiltered && (
        <Stats
          title="Long only when Nifty is in an uptrend"
          subtitle="The standard 'don't fight the index' filter, tested honestly"
          t={data.studyRegimeFiltered}
        />
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
          Score vs {s.signal.horizon}-day forward return — the whole universe
        </p>
        <SignalBuckets buckets={s.signal.buckets} horizon={s.signal.horizon} />
      </div>

      <p className="text-xs text-[var(--muted)]">
        {s.symbolsTested} stocks · net of {s.config.costPct}% round-trip cost · entries next-open ·
        stop/target from the engine&apos;s own ATR plan · {s.config.holdMaxDays}-day time stop.
        Computed {new Date(data.generatedAt).toLocaleString('en-IN')}.
      </p>
    </div>
  );
}

function Stats({ title, subtitle, t }: { title: string; subtitle?: string; t: AggregateStudy }) {
  const e = t.trade.expectancyR;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="text-xs text-[var(--muted)]">{subtitle}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Trades" value={t.trade.trades.toLocaleString('en-IN')} />
        <Cell label="Win rate" value={`${t.trade.winRate.toFixed(1)}%`} />
        <Cell
          label="Expectancy"
          value={`${e >= 0 ? '+' : ''}${e.toFixed(3)}R`}
          color={e > 0.03 ? 'var(--bull)' : e < -0.03 ? 'var(--bear)' : 'var(--warn)'}
        />
        <Cell
          label="Profit factor"
          value={t.trade.profitFactor.toFixed(2)}
          color={t.trade.profitFactor >= 1 ? 'var(--bull)' : 'var(--bear)'}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5 text-base font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
