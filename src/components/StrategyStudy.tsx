'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AggregateStudy, Engine } from '@/lib/backtest';
import { ENGINE_VALIDATION } from '@/lib/validation';
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
  { id: 'short', label: 'Swing', blurb: 'Eight weighted signals · momentum, trend and price structure.' },
  { id: 'mid', label: 'Position', blurb: '50 / 200-day trend rules and weekly agreement.' },
  { id: 'long', label: 'Long term', blurb: 'Price-trend proxy only. The fundamental model has not been historically validated.' },
];

export default function StrategyStudy() {
  const [engine, setEngine] = useState<Engine>('short');
  const [byEngine, setByEngine] = useState<Partial<Record<Engine, StudyResp>>>({});
  const [state, setState] = useState<'idle' | 'running' | 'error'>('idle');
  const data = byEngine[engine] ?? null;

  useEffect(() => {
    if (byEngine[engine]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/backtest-study?engine=${engine}&cachedOnly=1`);
        if (cancelled || res.status === 204 || !res.ok) return;
        const json = (await res.json()) as StudyResp;
        if (!cancelled) setByEngine((m) => ({ ...m, [engine]: json }));
      } catch { /* The recorded study stays available offline. */ }
    })();
    return () => { cancelled = true; };
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
    } catch { setState('error'); }
  }, [engine]);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent)]">Evidence before conviction</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">The historical record.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            A transparent record of historical tests. Sample size, trading costs and limitations belong beside the result.
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">Research · no return promise</span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Strategy being studied">
        {ENGINES.map((item) => <button key={item.id} disabled={state === 'running'} onClick={() => { setEngine(item.id); setState('idle'); }} aria-pressed={engine === item.id}
          className={`min-h-12 rounded-lg border px-3 py-3 text-sm transition disabled:opacity-60 ${engine === item.id ? 'border-[var(--accent)] bg-[var(--surface-2)] font-medium' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'}`}>
          {item.label}
        </button>)}
      </div>
      <RecordedEvidence engine={engine} />
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Explore a universe study</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{ENGINES.find((item) => item.id === engine)!.blurb}</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Replay the app&apos;s configured liquid NSE universe using only data available at each decision point. Historical entries use the next session&apos;s open. Cached results may be from an earlier run.</p>
        {!data && state !== 'running' && <button onClick={run} className="mt-4 min-h-12 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--background)] hover:brightness-105">Run historical study</button>}
        {!data && state === 'idle' && <p className="mt-2 text-xs text-[var(--muted)]">Usually 1–3 minutes on the server. The recorded evidence above is available immediately.</p>}
        {state === 'running' && <p role="status" className="mt-4 text-sm text-[var(--muted)]">Replaying the selected engine across available histories. You can leave this view while the server works.</p>}
        {state === 'error' && <p role="alert" className="mt-4 text-sm text-[var(--bear)]">The study could not finish. The recorded evidence remains available. Try the run again.</p>}
      </section>
      {data && <Results data={data} />}
    </div>
  );
}

function RecordedEvidence({ engine }: { engine: Engine }) {
  const evidence = ENGINE_VALIDATION[engine];
  return <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" aria-label="Recorded strategy validation">
    <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Recorded study · measured {evidence.measuredOn}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--warn)]">{evidence.isProxy ? 'Fundamental model remains unvalidated.' : 'No demonstrated edge.'}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
        {engine === 'short' ? 'The existing weighted swing score has not demonstrated a stable trading edge. The relationship between score and subsequent returns changed sign across the two recorded periods. Neither a bullish reading nor an inverted score establishes a profitable strategy.' :
          evidence.isProxy ? 'Only a historical price-trend proxy was tested. Today’s fundamental inputs cannot be replayed honestly without historical, point-in-time fundamentals. These results do not validate the fundamental score.' :
            'In the stored study, higher scores did not correspond to higher subsequent returns. A negative historical association does not establish a profitable inverse strategy.'}
      </p>
    </div>
    <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
      <Cell label="Signal observations" value={evidence.samples.toLocaleString('en-IN')} />
      <Cell label="Stocks tested" value={String(evidence.symbols)} />
      <Cell label="Net expectancy / trade" value={`${evidence.expectancyR.toFixed(3)}R`} color="var(--bear)" />
      <Cell label="Profit factor" value={evidence.profitFactor.toFixed(2)} />
    </div>
    <div className="space-y-4 px-5 py-5 sm:px-6">
      <p className="text-sm text-[var(--muted)]">
        Score / {evidence.horizonDays}-day return correlation: <strong className="tnum text-[var(--foreground)]">{evidence.correlation.toFixed(4)}</strong>.
        {' '}Lowest score bucket: <span className="tnum">{evidence.lowBucketReturn >= 0 ? '+' : ''}{evidence.lowBucketReturn.toFixed(3)}%</span> average forward return;
        {' '}highest: <span className="tnum">{evidence.highBucketReturn >= 0 ? '+' : ''}{evidence.highBucketReturn.toFixed(3)}%</span>.
      </p>
      {evidence.inSample && evidence.outOfSample && <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left text-xs text-[var(--muted)]">Two recorded, non-overlapping windows. Their labels are preserved from the stored evidence. The primary window comes from the default run, whose first 210 sessions were indicator warm-up, so its decisions began roughly ten months after the labelled start.</caption>
          <thead className="text-xs text-[var(--muted)]"><tr className="border-b border-[var(--border)]"><th className="py-3 pr-3 font-medium">Window</th><th className="px-2 py-3 text-right font-medium">Correlation</th><th className="py-3 pl-2 text-right font-medium">Net R / trade</th></tr></thead>
          <tbody>{[evidence.inSample, evidence.outOfSample].map((window, index) => <tr key={window.window} className="border-b border-[var(--border)]">
            <th className="py-3 pr-3 font-normal">{window.window}<span className="mt-1 block text-xs text-[var(--muted)]">{index === 0 ? 'Primary window' : 'Earlier comparison'}</span></th>
            <td className="tnum px-2 py-3 text-right">{window.correlation >= 0 ? '+' : ''}{window.correlation.toFixed(4)}</td>
            <td className="tnum py-3 pl-2 text-right">{window.expectancyR >= 0 ? '+' : ''}{window.expectancyR.toFixed(3)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="border-l-2 border-[var(--accent)] pl-4 text-sm leading-relaxed text-[var(--muted)]">
        <p><strong className="text-[var(--foreground)]">Read the sample correctly.</strong> Signal observations are daily measurements, not independent trades. Nearby forward-return windows overlap. The stored record does not include a trade count, uncertainty intervals or the full per-stock output.</p>
        <p className="mt-2">Assumed round-trip trading cost: 0.2%. Entries at the next open; stop, target and time exits follow each engine. R is a multiple of initial trade risk. Signal-bucket returns are price changes; trading expectancy includes the cost assumption.</p>
        <p className="mt-2">The selected current universe can introduce survivorship bias. These historical comparisons do not establish future performance or validate an inverse strategy. The earlier comparison is not a prospective, untouched test.</p>
        <p className="mt-2">Correlation here is the sample-weighted average of each stock&apos;s own score/return correlation, not one correlation over all pooled observations.</p>
      </div>
      {engine === 'mid' && <MidHypothesis />}
    </div>
  </section>;
}

/** The weeks-to-months (mid) study written down as a hypothesis, exactly as the code implements it. */
function MidHypothesis() {
  return <div className="rounded-lg border border-[var(--border)] px-4 py-4 text-sm leading-relaxed text-[var(--muted)]">
    <p className="font-semibold text-[var(--foreground)]">The tested weeks-to-months hypothesis, as implemented</p>
    <ul className="mt-2 list-disc space-y-1 pl-5">
      <li>Universe: the app&apos;s current list of liquid NSE stocks with at least 240 sessions of history. Because it is today&apos;s list, companies delisted earlier are absent.</li>
      <li>Decision: each session&apos;s close, using only bars up to that close.</li>
      <li>Entry: the next session&apos;s open when the mid-term score is 58 or higher and the model stop and target are valid; one position per stock at a time.</li>
      <li>Exit: the model stop (an opening gap through it fills at the open), the first target, or after 40 sessions. If one bar touches both levels, the stop is assumed first. Assumed round-trip cost 0.2%.</li>
      <li>Signal study: the score against the 20-session forward price change on every decision day, so neighbouring observations overlap.</li>
      <li>Window: a three-year fetch whose first 210 sessions are indicator warm-up, so decisions span roughly the latest two years before the measurement date.</li>
    </ul>
    <p className="mt-2">Not tested: holds longer than 40 sessions, other forward horizons, the weeks-to-months evidence shown in stock reports, fundamentals or news (no point-in-time history), delisted companies, total-return benchmarks, liquidity limits or a capital-constrained portfolio. A run of the study below re-measures the same rules on newer data; it does not test new ones.</p>
  </div>;
}

function Results({ data }: { data: StudyResp }) {
  const study = data.study;
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Available run · {new Date(data.generatedAt).toLocaleString('en-IN')}</p>
      <h2 className="mt-2 text-xl font-semibold">A historical result, not a validated edge.</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Across {study.symbolsTested} stocks and {study.signal.samples.toLocaleString('en-IN')} signal observations, score / {study.signal.horizon}-day forward-return correlation was {study.signal.correlation.toFixed(3)} (sample-weighted average of per-stock correlations). Net expectancy was {study.trade.expectancyR.toFixed(3)}R across {study.trade.trades.toLocaleString('en-IN')} simulated trades. A single run cannot establish stable predictive power.</p>
      {data.isProxy && <p className="mt-3 text-sm text-[var(--warn)]">Price-trend proxy only. This run does not test the fundamental model.</p>}
    </section>
    <Stats title="All qualifying historical signals" study={study} />
    {data.studyRegimeFiltered && <Stats title="With the Nifty uptrend filter" study={data.studyRegimeFiltered} />}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-4 text-sm font-semibold">Score buckets & {study.signal.horizon}-day forward return</h3>
      <SignalBuckets buckets={study.signal.buckets} horizon={study.signal.horizon} />
    </section>
    <p className="text-xs leading-relaxed text-[var(--muted)]">{study.symbolsTested} stocks tested · {study.config.costPct}% assumed round-trip cost · entries at next open · engine stop / target · {study.config.holdMaxDays}-day time stop. Each stock is simulated separately; this is not a capital-constrained portfolio. Overlapping signal observations are not independent. The current universe, available histories and simplified fills limit how these results generalise.</p>
  </div>;
}

function Stats({ title, study }: { title: string; study: AggregateStudy }) {
  return <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
    <h3 className="px-5 py-4 text-sm font-semibold">{title}</h3>
    <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
      <Cell label="Simulated trades" value={study.trade.trades.toLocaleString('en-IN')} />
      <Cell label="Historical win rate" value={`${study.trade.winRate.toFixed(1)}%`} />
      <Cell label="Net expectancy" value={`${study.trade.expectancyR >= 0 ? '+' : ''}${study.trade.expectancyR.toFixed(3)}R`} />
      <Cell label="Profit factor" value={Number.isFinite(study.trade.profitFactor) ? study.trade.profitFactor.toFixed(2) : '—'} />
    </div>
  </section>;
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="bg-[var(--surface)] px-4 py-4 sm:px-5">
    <p className="text-xs text-[var(--muted)]">{label}</p>
    <p className="tnum mt-1 text-xl font-semibold tracking-tight" style={color ? { color } : undefined}>{value}</p>
  </div>;
}
