'use client';

import type { EvidenceStatus, Observation, PositionEvidence, Tone, TrendRead } from '@/lib/positionEvidence';
import type { CandlePattern, CandleScan, PatternStatus } from '@/lib/candlePatterns';
import type { IndicatorEvent, IndicatorEventStatus } from '@/lib/indicatorEvents';
import type { CompanyData } from '@/lib/yahoo';
import type { TimeframeAnalysis } from '@/lib/timeframes';
import { ENGINE_VALIDATION } from '@/lib/validation';
import { useCompanyNews, type NewsState } from '@/lib/useNews';
import { compactVolume, inr, pct } from '@/lib/format';
import Collapsible from './Collapsible';
import { NewsList } from './NewsPanel';

const TONE_COLOR: Record<Tone, string> = {
  positive: 'var(--bull)',
  negative: 'var(--bear)',
  caution: 'var(--warn)',
  neutral: 'var(--foreground)',
};

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  available: 'Available',
  partial: 'Partial data',
  insufficient: 'Insufficient history',
  unavailable: 'Unavailable',
};

const TIMEFRAME_LABEL: Record<Observation['timeframe'], string> = {
  daily: 'Daily bars',
  weekly: 'Weekly bars',
  snapshot: 'Provider snapshot',
  event: 'Event calendar',
};

const PATTERN_STATUS: Record<PatternStatus, { label: string; tone: Tone }> = {
  forming: { label: 'Forming · final bar in progress', tone: 'caution' },
  awaiting: { label: 'Awaiting confirmation', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'neutral' },
  invalidated: { label: 'Invalidated', tone: 'neutral' },
  expired: { label: 'Expired unconfirmed', tone: 'neutral' },
  'resolved-up': { label: 'Resolved upward', tone: 'neutral' },
  'resolved-down': { label: 'Resolved downward', tone: 'neutral' },
  unresolved: { label: 'Unresolved', tone: 'neutral' },
};

const EVENT_STATUS: Record<IndicatorEventStatus, string> = {
  current: 'Current level',
  awaiting: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  failed: 'Follow-through failed',
  active: 'Active',
  invalidated: 'Invalidated',
};

const DIRECTION_TONE = { bullish: 'positive', bearish: 'negative', neutral: 'neutral' } as const;

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });

export default function PositionBrief({
  position,
  company,
  mid,
  refreshKey,
}: {
  position: PositionEvidence;
  company: CompanyData;
  mid: TimeframeAnalysis;
  refreshKey: number;
}) {
  const news = useCompanyNews(company.profile.name, company.profile.symbol, refreshKey);
  const completion =
    position.lastBarComplete === false ? ' (session still in progress)' : position.lastBarComplete === null ? ' (completion unknown)' : '';

  return (
    <div className="space-y-3">
      <section aria-labelledby="position-brief-title" className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Mid-term · position horizon · weeks to months</p>
          <h2 id="position-brief-title" className="mt-2 text-lg font-semibold tracking-tight">Weeks-to-months evidence</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Daily bars through {position.stockBarDate}{completion}
            {position.benchmark.lastBar ? `; ${position.benchmark.index.name} through ${position.benchmark.lastBar}` : ''}. These observations sit beside the mid-term score.
            They are not inputs to it and have not been historically tested; they describe the setup rather than forecast it.
          </p>
        </header>

        <ul aria-label="Evidence summary" className="divide-y divide-[var(--border)]">
          {position.summary.map((row) => (
            <li key={row.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-baseline sm:gap-4 sm:px-6">
              <span className="text-sm text-[var(--muted)]">{row.title}</span>
              <span className="text-sm font-medium" style={{ color: TONE_COLOR[row.tone] }}>{row.reading}</span>
              <span className="tnum text-xs text-[var(--muted)]">{row.asOf}</span>
            </li>
          ))}
          <NewsSummaryRow news={news} />
        </ul>

        <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] lg:grid-cols-2">
          <div className="bg-[var(--surface)] px-5 py-4 sm:px-6">
            <h3 className="text-sm font-semibold text-[var(--warn)]">Conflicting evidence</h3>
            {position.conflicts.length ? (
              <ul className="mt-2 space-y-2">
                {position.conflicts.map((c) => <Bullet key={c} text={c} color="var(--warn)" />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">No rule-defined conflicts among the available evidence. Missing evidence is not agreement.</p>
            )}
          </div>
          <div className="bg-[var(--surface)] px-5 py-4 sm:px-6">
            <h3 className="text-sm font-semibold">What would change these readings</h3>
            {position.invalidation.length ? (
              <ul className="mt-2 space-y-2">
                {position.invalidation.map((c) => <Bullet key={c} text={c} color="var(--muted)" />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">Not enough history to state trend conditions.</p>
            )}
          </div>
        </div>

        <p className="border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-xs leading-relaxed text-[var(--muted)] sm:px-6">
          <strong className="text-[var(--warn)]">No demonstrated edge for this horizon.</strong> In the stored mid-term study, higher scores were not followed by higher returns; the
          association was negative, which does not validate the opposite either. Agreement among these observations is not evidence of a profitable trade.
        </p>
      </section>

      <Collapsible title="Market and sector backdrop" subtitle="The Nifty 50 and the stock's sector index under the same four trend checks">
        <div className="divide-y divide-[var(--border)]">
          <TrendPanel trend={position.market} />
          <TrendPanel
            trend={position.sectorTrend}
            basis={
              position.sector.choice.index
                ? `${position.sector.choice.fit === 'approximate' ? 'Approximate' : 'Direct'} match: ${position.sector.choice.basis}`
                : position.sector.choice.basis
            }
          />
        </div>
      </Collapsible>

      <Collapsible title="Trend, momentum and relative strength" subtitle="Primary trend checks, dated crossovers and 3, 6 and 12-month comparisons">
        <div className="divide-y divide-[var(--border)]">
          <TrendPanel trend={position.stockTrend} />
          <ObservationList items={position.crosses} />
          <RelativeTable position={position} />
          <ObservationList items={[...position.relative.observations, ...position.momentum]} />
        </div>
      </Collapsible>

      <Collapsible title="Price, volume and patterns" subtitle="Range, participation, candle formations and indicator events with dates">
        <div className="divide-y divide-[var(--border)]">
          <ObservationList items={position.structure} />
          <CandleSection scan={position.candles.daily} />
          <CandleSection scan={position.candles.weekly} />
          <IndicatorSection events={position.indicators.events} notes={position.indicators.notes} />
        </div>
      </Collapsible>

      <Collapsible title="Fundamentals context" subtitle="Provider snapshot with source and period labels; not a score input">
        <FundamentalsSection position={position} />
      </Collapsible>

      <Collapsible title="News and events" subtitle="Results dates, recent gaps and attributed headlines">
        <div className="divide-y divide-[var(--border)]">
          <ObservationList items={position.events} />
          <NewsList state={news} company={company.profile.name} symbol={company.profile.symbol} />
        </div>
      </Collapsible>

      <Collapsible title="Risk and position arithmetic" subtitle="Volatility, drawdown, gaps, liquidity and an illustrative gap scenario">
        <RiskSection position={position} />
      </Collapsible>

      <Collapsible title="Historical status for this engine" subtitle="What the stored mid-term study tested, and what it did not">
        <ValidationSection position={position} mid={mid} />
      </Collapsible>

      <div className="rounded-xl border border-[var(--border)] px-5 py-4 text-xs leading-relaxed text-[var(--muted)]">
        <p className="font-semibold text-[var(--foreground)]">Limits of this evidence</p>
        <ul className="mt-2 space-y-1.5">
          {position.limitations.map((l) => <Bullet key={l} text={l} color="var(--muted)" />)}
        </ul>
      </div>
    </div>
  );
}

function Bullet({ text, color }: { text: string; color: string }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed text-[var(--muted)]">
      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <span>{text}</span>
    </li>
  );
}

function NewsSummaryRow({ news }: { news: NewsState }) {
  const { result, loading, failed } = news;
  const reading = !result
    ? loading
      ? 'Loading headlines…'
      : 'News unavailable; see News and events to retry'
    : result.status === 'empty'
      ? 'No headline naming the company was found'
      : `${result.recent.length} headline${result.recent.length === 1 ? '' : 's'} in the last 7 days${result.older.length ? ` · ${result.older.length} older` : ''}${failed ? ' · refresh failed, may be stale' : ''}`;
  return (
    <li className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-baseline sm:gap-4 sm:px-6">
      <span className="text-sm text-[var(--muted)]">News</span>
      <span className="text-sm font-medium" role={loading && !result ? 'status' : undefined}>{reading}</span>
      <span className="tnum text-xs text-[var(--muted)]">{result ? `Feed ${ist(result.fetchedAt)} IST` : '—'}</span>
    </li>
  );
}

function ObservationList({ items }: { items: Observation[] }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((o) => (
        <li key={o.id} className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-semibold">{o.label}</h3>
            {o.status !== 'available' && <span className="text-xs text-[var(--warn)]">{STATUS_LABEL[o.status]}</span>}
          </div>
          <p className="tnum mt-1 text-sm">{o.reading}</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: o.tone === 'neutral' ? 'var(--muted)' : TONE_COLOR[o.tone] }}>{o.interpretation}</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">Rule: </span>
            {o.rule}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {TIMEFRAME_LABEL[o.timeframe]} · {o.lookback} · {o.asOf ? `as of ${o.asOf}` : 'date not supplied'}
          </p>
        </li>
      ))}
    </ul>
  );
}

function TrendPanel({ trend, basis }: { trend: TrendRead; basis?: string }) {
  const color = TONE_COLOR[trend.tone];
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{trend.subject}</h3>
        <span className="text-sm font-semibold" style={{ color }}>
          {trend.label}
          {trend.available ? ` · ${trend.rising} of ${trend.available} rising checks` : ''}
        </span>
      </div>
      {basis && <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{basis}</p>}
      {trend.note && <p className="mt-2 text-xs leading-relaxed text-[var(--warn)]">{trend.note}</p>}
      {trend.checks.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {trend.checks.map((c) => (
            <li key={c.id} className="flex gap-3 text-sm">
              <span aria-hidden className="tnum w-4 shrink-0 text-center" style={{ color: c.state === 1 ? 'var(--bull)' : c.state === -1 ? 'var(--bear)' : 'var(--muted)' }}>
                {c.state === 1 ? '▲' : c.state === -1 ? '▼' : c.state === 0 ? '–' : '?'}
              </span>
              <span className="min-w-0">
                {c.label}:{' '}
                <strong className="font-medium">
                  {c.state === 1 ? 'rising condition met' : c.state === -1 ? 'falling condition met' : c.state === 0 ? 'neither condition met' : 'unavailable'}
                </strong>
                <span className="tnum mt-0.5 block text-xs text-[var(--muted)]">{c.reading}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Rule: rising when every available check meets its rising condition, falling when every check meets its falling condition, otherwise mixed. Simple moving averages of daily closes; weekly
        EMAs from weekly bars built from the same dailies. As of {trend.asOf ?? '—'}.
      </p>
    </div>
  );
}

function RelativeTable({ position }: { position: PositionEvidence }) {
  const hasSector = position.relative.windows.some((w) => w.sector !== null);
  const hasNifty = position.relative.windows.some((w) => w.nifty !== null);
  const sectorName = position.sector.choice.index?.name ?? 'Sector';
  const signed = (n: number | null) => pct(n, 1, true);
  const diff = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} pts`);
  if (!hasNifty && !hasSector) {
    return <p className="px-5 py-4 text-sm text-[var(--muted)]">Relative strength is unavailable: no comparison index series could be retrieved.</p>;
  }
  return (
    <div className="px-5 py-4">
      <h3 className="text-sm font-semibold">Relative performance</h3>
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Relative performance by window">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="mb-2 text-left text-xs leading-relaxed text-[var(--muted)]">{position.relative.note}</caption>
          <thead className="text-xs text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th scope="col" className="py-2 pr-3 font-medium">Window</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Stock</th>
              {hasNifty && <th scope="col" className="px-2 py-2 text-right font-medium">{position.benchmark.index.name}</th>}
              {hasNifty && <th scope="col" className="px-2 py-2 text-right font-medium">Difference</th>}
              {hasSector && <th scope="col" className="px-2 py-2 text-right font-medium">{sectorName}</th>}
              {hasSector && <th scope="col" className="py-2 pl-2 text-right font-medium">Difference</th>}
            </tr>
          </thead>
          <tbody>
            {position.relative.windows.map((w) => (
              <tr key={w.sessions} className="border-b border-[var(--border)]">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {w.label}
                  <span className="tnum mt-0.5 block text-xs text-[var(--muted)]">{w.from ? `${w.from} → ${w.to}` : 'Insufficient history'}</span>
                </th>
                <td className="tnum px-2 py-2 text-right">{signed(w.stock)}</td>
                {hasNifty && <td className="tnum px-2 py-2 text-right">{signed(w.nifty)}</td>}
                {hasNifty && <td className="tnum px-2 py-2 text-right" style={{ color: w.vsNifty === null ? undefined : w.vsNifty > 1 ? 'var(--bull)' : w.vsNifty < -1 ? 'var(--bear)' : undefined }}>{diff(w.vsNifty)}</td>}
                {hasSector && <td className="tnum px-2 py-2 text-right">{signed(w.sector)}</td>}
                {hasSector && <td className="tnum py-2 pl-2 text-right" style={{ color: w.vsSector === null ? undefined : w.vsSector > 1 ? 'var(--bull)' : w.vsSector < -1 ? 'var(--bear)' : undefined }}>{diff(w.vsSector)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandleSection({ scan }: { scan: CandleScan }) {
  const unit = scan.timeframe === 'daily' ? 'Daily' : 'Weekly';
  return (
    <div className="py-4">
      <div className="px-5">
        <h3 className="text-sm font-semibold">{unit} candle formations</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          {scan.window}. Latest {scan.timeframe === 'daily' ? 'bar' : 'week (dated by its Monday)'} {scan.lastBarDate ?? '—'}
          {scan.lastBarComplete === false ? ', still in progress' : scan.lastBarComplete === null ? ', completion unknown' : ', complete'}.
        </p>
        {scan.note && <p className="mt-2 text-xs text-[var(--warn)]">{scan.note}</p>}
      </div>
      {!scan.note && scan.patterns.length === 0 && (
        <p className="px-5 pt-3 text-sm text-[var(--muted)]">No formation met its written rules in this window. That is a normal result, not a signal.</p>
      )}
      {scan.patterns.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {scan.patterns.map((p) => <PatternRow key={p.id} p={p} />)}
        </ul>
      )}
    </div>
  );
}

function PatternRow({ p }: { p: CandlePattern }) {
  const status = PATTERN_STATUS[p.status];
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {p.name}{' '}
          <span className="font-normal" style={{ color: TONE_COLOR[DIRECTION_TONE[p.direction]] === 'var(--foreground)' ? 'var(--muted)' : TONE_COLOR[DIRECTION_TONE[p.direction]] }}>
            · {p.direction === 'neutral' ? 'neutral (indecision)' : `${p.direction} formation`}
          </span>
        </h4>
        <span className="text-xs font-medium" style={{ color: status.tone === 'caution' ? 'var(--warn)' : 'var(--muted)' }}>
          {status.label}
          {p.statusDate ? ` · ${p.statusDate}` : ''}
        </span>
      </div>
      <p className="tnum mt-1 text-xs text-[var(--muted)]">
        {p.timeframe === 'weekly' ? 'Weeks beginning' : 'Sessions'} {p.dates.join(', ')}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{p.statusNote}</p>
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--accent)]">Rules met, context and price evidence</summary>
        <div className="space-y-2 pb-2 text-xs leading-relaxed text-[var(--muted)]">
          <ul className="space-y-1">
            {p.criteria.map((c) => <li key={c}>• {c}</li>)}
          </ul>
          <p>{p.trendContext}</p>
          <p>{p.volumeContext}</p>
          <p><span className="font-medium text-[var(--foreground)]">Confirmation: </span>{p.confirmationRule}</p>
          <p><span className="font-medium text-[var(--foreground)]">Invalidation: </span>{p.invalidationRule}</p>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${p.name} price bars`}>
            <table className="w-full min-w-[26rem] text-left">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="py-1 pr-2 font-medium">{p.timeframe === 'weekly' ? 'Week of' : 'Date'}</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">Open</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">High</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">Low</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">Close</th>
                  <th scope="col" className="py-1 pl-1 text-right font-medium">Volume</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {p.bars.map((b) => (
                  <tr key={b.date} className="border-b border-[var(--border)]">
                    <th scope="row" className="py-1 pr-2 font-normal">{b.date}</th>
                    <td className="px-1 py-1 text-right">{inr(b.open)}</td>
                    <td className="px-1 py-1 text-right">{inr(b.high)}</td>
                    <td className="px-1 py-1 text-right">{inr(b.low)}</td>
                    <td className="px-1 py-1 text-right">{inr(b.close)}</td>
                    <td className="py-1 pl-1 text-right">{compactVolume(b.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>A recognised shape is a description of past bars, not a validated forecast. NIVRA has not tested these formation rules historically.</p>
        </div>
      </details>
    </li>
  );
}

function IndicatorSection({ events, notes }: { events: IndicatorEvent[]; notes: string[] }) {
  return (
    <div className="py-4">
      <div className="px-5">
        <h3 className="text-sm font-semibold">Indicator transitions and levels</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          Dated transitions first, then current levels. These indicators are calculated from the same prices, so they are context, not independent votes.
        </p>
        {notes.map((n) => <p key={n} className="mt-2 text-xs text-[var(--warn)]">{n}</p>)}
      </div>
      {events.length === 0 ? (
        <p className="px-5 pt-3 text-sm text-[var(--muted)]">No indicator transition met its rule in the search window.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold">{e.name}</h4>
                <span className="text-xs text-[var(--muted)]">
                  {e.timeframe === 'weekly' ? 'Weekly' : 'Daily'} · {EVENT_STATUS[e.status]}
                  {e.statusDate ? ` · ${e.statusDate}` : ''}
                </span>
              </div>
              <p className="tnum mt-1 text-sm">{e.reading}</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: e.direction === 'neutral' || e.kind === 'state' ? 'var(--muted)' : TONE_COLOR[DIRECTION_TONE[e.direction]] }}>{e.interpretation}</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">Rule: </span>
                {e.rule} Search window: {e.lookback.toLowerCase()}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FundamentalsSection({ position }: { position: PositionEvidence }) {
  const f = position.fundamentals;
  return (
    <div>
      <div className="px-5 py-4">
        <p className="text-sm">
          <span className="font-semibold">Growth: {f.growthLabel.toLowerCase()}.</span> <span className="text-[var(--muted)]">{f.growthNote}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{f.sourceNote}</p>
      </div>
      {f.status !== 'unavailable' && (
        <dl className="grid grid-cols-1 gap-px border-y border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
          {f.items.map((i) => (
            <div key={i.label} className="bg-[var(--surface)] px-5 py-3">
              <dt className="text-xs uppercase tracking-widest text-[var(--muted)]">{i.label}</dt>
              <dd className="tnum mt-1 text-sm font-medium">{i.available ? i.value : 'Not supplied'}</dd>
              <dd className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{i.basis}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold">Reported quarterly earnings per share</h3>
        {f.quarters.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">The provider returned no dated quarterly results for this listing.</p>
        ) : (
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Reported quarterly earnings per share">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <caption className="mb-2 text-left text-xs leading-relaxed text-[var(--muted)]">
                Provider results history{f.quartersRetrievedAt ? `, retrieved ${ist(f.quartersRetrievedAt)} IST` : ''}. Period end and reported date are as supplied. The estimate column is the provider&apos;s analyst
                consensus, not a company figure. Check figures against the exchange filing.
              </caption>
              <thead className="text-xs text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="py-2 pr-3 font-medium">Fiscal quarter</th>
                  <th scope="col" className="px-2 py-2 font-medium">Period end</th>
                  <th scope="col" className="px-2 py-2 font-medium">Reported (IST)</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">EPS</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">Consensus estimate</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {[...f.quarters].reverse().map((q) => (
                  <tr key={`${q.periodEnd}-${q.reportedAt}`} className="border-b border-[var(--border)]">
                    <th scope="row" className="py-2 pr-3 font-normal">{q.fiscalQuarter ?? '—'}</th>
                    <td className="px-2 py-2">{q.periodEnd ?? '—'}</td>
                    <td className="px-2 py-2">{q.reportedAt ? istDay(q.reportedAt) : '—'}</td>
                    <td className="px-2 py-2 text-right">{inr(q.epsActual)}</td>
                    <td className="py-2 pl-2 text-right">{inr(q.epsEstimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--border)] px-5 py-4">
        <h3 className="text-sm font-semibold">Not covered by this data</h3>
        <ul className="mt-2 space-y-1.5">
          {f.unavailable.map((u) => <Bullet key={u} text={u} color="var(--muted)" />)}
        </ul>
      </div>
    </div>
  );
}

function RiskSection({ position }: { position: PositionEvidence }) {
  const { observations, flags, gapScenario } = position.risk;
  return (
    <div className="divide-y divide-[var(--border)]">
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-[var(--warn)]">Threshold flags</h3>
        {flags.length ? (
          <ul className="mt-2 space-y-1.5">{flags.map((f) => <Bullet key={f} text={f} color="var(--warn)" />)}</ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">None of NIVRA&apos;s risk thresholds is met. That does not make a position safe; losses and gaps remain possible.</p>
        )}
      </div>
      <ObservationList items={observations} />
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold">Illustrative gap scenario</h3>
        {gapScenario ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              The mid-term model&apos;s illustrative stop is {inr(gapScenario.stop)}, a planned fall of {gapScenario.plannedLossPct.toFixed(1)}% from the latest close of {inr(gapScenario.price)}.
              If the stock opened below that stop by the largest overnight fall of the past year ({pct(gapScenario.gapPct, 1, true)} on {gapScenario.gapDate}), the exit would be about{' '}
              {gapScenario.scenarioLossPct.toFixed(1)}% below the latest close — roughly {gapScenario.multiple.toFixed(1)}× the planned risk.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              For a position sized to lose 1% of capital at the stop, that gap would mean a loss of about {gapScenario.multiple.toFixed(1)}% of capital, before costs and slippage. A future gap can be
              larger than any seen in the last year.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">Unavailable: the scenario needs a model stop below the latest close and a recent downward opening gap.</p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          This is arithmetic on stated assumptions, not a loss limit or a suitability assessment. A single-stock report is not a portfolio plan; correlated holdings can fall together.
        </p>
      </div>
    </div>
  );
}

function ValidationSection({ position, mid }: { position: PositionEvidence; mid: TimeframeAnalysis }) {
  const v = ENGINE_VALIDATION.mid;
  const sign = (n: number, d: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
  const a = v.inSample;
  const b = v.outOfSample;
  const range = (ci: [number, number] | undefined, d: number) => (ci ? ` (95% interval ${sign(ci[0], d)} to ${sign(ci[1], d)})` : '');
  const twoPeriods = a?.nullCorrelation !== undefined && b?.nullCorrelation !== undefined ? { a, b, aNull: a.nullCorrelation, bNull: b.nullCorrelation } : null;
  return (
    <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
      <p>
        <strong className="text-[var(--foreground)]">Stored record, measured {v.measuredOn}.</strong> This page does not re-run it. The current mid-term score is {mid.score}/100 ({mid.verdictLabel.toLowerCase()}).
      </p>
      {twoPeriods ? (
        <ul className="space-y-2">
          <Bullet
            color="var(--muted)"
            text={`Two separate periods: ${twoPeriods.a.window} and ${twoPeriods.b.window}. The analysis plan and decision rule were committed before the ${twoPeriods.b.window} run, which had never been tested for this engine.`}
          />
          <Bullet
            color="var(--muted)"
            text={`Signal study: the score against the ${v.horizonDays}-session forward price change. Correlation ${sign(twoPeriods.a.correlation, 3)}${range(twoPeriods.a.correlationCI, 3)} and ${sign(twoPeriods.b.correlation, 3)}${range(twoPeriods.b.correlationCI, 3)}, as the sample-weighted average of per-stock correlations. On shuffled prices, where nothing is predictable, the same measure reads ${sign(twoPeriods.aNull, 3)} and ${sign(twoPeriods.bNull, 3)}.`}
          />
          <Bullet
            color="var(--muted)"
            text={`Ranking across stocks: on each day, the score's rank correlation with later returns averaged ${sign(twoPeriods.a.meanDailyIC ?? 0, 3)}${range(twoPeriods.a.meanDailyICCI, 3)} and ${sign(twoPeriods.b.meanDailyIC ?? 0, 3)}${range(twoPeriods.b.meanDailyICCI, 3)}${
              [twoPeriods.a, twoPeriods.b].every((w) => w.meanDailyICCI && w.meanDailyICCI[0] <= 0 && w.meanDailyICCI[1] >= 0) ? '; both intervals include zero' : ''
            }.`}
          />
          <Bullet
            color="var(--muted)"
            text={`Trade simulation: entry at the next session's open when the score is 58 or higher, exit at the model stop, the first target or after ${position.horizon.maxHoldSessions} sessions, ${position.horizon.costPct}% round-trip cost. Net expectancy ${sign(twoPeriods.a.expectancyR, 3)}R${range(twoPeriods.a.expectancyCI, 3)} and ${sign(twoPeriods.b.expectancyR, 3)}R${range(twoPeriods.b.expectancyCI, 3)}. Average buy-and-hold over the same periods: ${sign(twoPeriods.a.buyHoldPct, 0)}% and ${sign(twoPeriods.b.buyHoldPct, 0)}% per stock.`}
          />
          <Bullet
            color="var(--warn)"
            text="Conclusion: no demonstrated edge in either period. Most of the negative correlation also appears on shuffled prices, so it reflects the measure rather than the market, and it does not support an inverse strategy."
          />
        </ul>
      ) : (
      <ul className="space-y-2">
        <Bullet
          color="var(--muted)"
          text={`Signal study: the score against the ${v.horizonDays}-session forward price change, over ${v.samples.toLocaleString('en-IN')} overlapping daily observations from ${v.symbols} stocks. Correlation ${sign(v.correlation, 4)}, computed as the sample-weighted average of per-stock correlations. The lowest score bucket averaged ${sign(v.lowBucketReturn, 3)}% and the highest ${sign(v.highBucketReturn, 3)}%.`}
        />
        <Bullet
          color="var(--muted)"
          text={`Trade simulation: entry at the next session's open when the score is 58 or higher, exit at the model stop, the first target or after ${position.horizon.maxHoldSessions} sessions, with a ${position.horizon.costPct}% round-trip cost assumed. Net expectancy ${sign(v.expectancyR, 3)}R per trade; profit factor ${v.profitFactor.toFixed(2)}.`}
        />
        <Bullet
          color="var(--muted)"
          text="Window: the default study fetches three years of daily bars and spends the first 210 sessions warming up its indicators, so decisions cover roughly the latest two years before the measurement date. No second, non-overlapping window is stored for this engine."
        />
        <Bullet
          color="var(--warn)"
          text="Conclusion: no demonstrated stable edge. Higher scores were followed by lower average returns in this sample; that does not validate an inverse strategy."
        />
      </ul>
      )}
      <div>
        <p className="font-semibold text-[var(--foreground)]">Not tested</p>
        <ul className="mt-2 space-y-1.5">
          <Bullet color="var(--muted)" text={`Holding periods longer than ${position.horizon.maxHoldSessions} sessions, or forward horizons other than ${v.horizonDays} sessions.`} />
          <Bullet color="var(--muted)" text="Any of the weeks-to-months evidence on this page: trend checks, relative strength, sector backdrop, candle formations or indicator events." />
          <Bullet color="var(--muted)" text="Fundamentals or news, because point-in-time history (what was public on each past date) is not available from the current sources." />
          <Bullet color="var(--muted)" text="A point-in-time universe: the study used today's list of stocks, so companies that were later delisted are missing (survivorship bias)." />
          <Bullet color="var(--muted)" text="Comparison with a total-return benchmark, liquidity limits, market impact or a capital-constrained portfolio." />
        </ul>
      </div>
      <p className="text-xs">The full record, costs and limitations are in Strategy evidence.</p>
    </div>
  );
}
