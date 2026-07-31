'use client';

import { useEffect, useState } from 'react';
import type { Levels, Snapshot } from '@/lib/swing';
import type { AnalystView, CompanyData, Fundamentals } from '@/lib/yahoo';
import { compactVolume, fracPct, inr, marketCap, num, pct } from '@/lib/format';
import StarButton from './StarButton';

/* ------------------------------------------------------------------ header */

interface LiveQuote {
  price: number;
  change: number;
  changePercent: number;
  at: string;
}

/**
 * Polls the quote-only endpoint so the header price stays current instead of
 * frozen at page load. Still Yahoo-delayed — never claimed otherwise — but it
 * updates on its own. Polling pauses when the tab is hidden. The header is keyed
 * by symbol at the call site, so this hook's instance never outlives one stock.
 */
function useLiveQuote(symbol: string, initial: { price: number; change: number; changePercent: number }) {
  const [quote, setQuote] = useState<LiveQuote>({ ...initial, at: '' });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const q = (await res.json()) as LiveQuote;
        if (!cancelled && typeof q.price === 'number') setQuote(q);
      } catch {
        /* transient — keep the last good value */
      }
    };

    poll();
    const id = setInterval(poll, 60_000); // 1 min; the data is delayed anyway
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return quote;
}

export function StockHeader({ company }: { company: CompanyData }) {
  const { profile } = company;
  const quote = useLiveQuote(profile.symbol, {
    price: company.quote.price,
    change: company.quote.change,
    changePercent: company.quote.changePercent,
  });
  const up = quote.changePercent >= 0;
  const color = up ? 'var(--bull)' : 'var(--bear)';

  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
          <StarButton symbol={profile.symbol} name={profile.name} />
          <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 tnum text-xs text-[var(--muted)]">
            {profile.symbol}
          </span>
          {company.quote.marketState && company.quote.marketState !== 'REGULAR' && (
            <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Market {company.quote.marketState.toLowerCase()}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {[profile.exchange, profile.sector, profile.industry].filter(Boolean).join(' · ')}
        </p>
        <EarningsBadge company={company} />
      </div>

      <div className="text-right">
        <p className="tnum text-3xl font-bold transition-colors">{inr(quote.price)}</p>
        <p className="tnum mt-0.5 text-sm font-medium" style={{ color }}>
          {up ? '+' : ''}
          {num(quote.change)} ({pct(quote.changePercent, 2, true)})
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Delayed{quote.at ? ` · ${new Date(quote.at).toLocaleTimeString('en-IN')}` : ''}
        </p>
      </div>
    </div>
  );
}

/** Next-results chip. Amber inside the 10-day gap-risk window, muted otherwise. */
function EarningsBadge({ company }: { company: CompanyData }) {
  const { nextDate, daysUntil, isEstimate } = company.earnings;
  if (!nextDate || daysUntil === null || daysUntil < 0) return null;

  const soon = daysUntil <= 10;
  const label =
    daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
  const nice = new Date(nextDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <span
      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
      style={
        soon
          ? { background: 'rgba(245,158,11,0.12)', color: 'var(--warn)' }
          : { background: 'var(--surface-2)', color: 'var(--muted)' }
      }
    >
      <span aria-hidden>📅</span>
      Results {label} · {nice}
      {isEstimate && <span className="opacity-70">(est.)</span>}
    </span>
  );
}

/* ------------------------------------------------------------- key metrics */

export function KeyMetrics({
  snapshot,
  levels,
  company,
}: {
  snapshot: Snapshot;
  levels: Levels;
  company: CompanyData;
}) {
  const items: { label: string; value: string; hint?: string; color?: string }[] = [
    {
      label: 'RSI (14)',
      value: snapshot.rsi14 !== null ? snapshot.rsi14.toFixed(1) : '—',
      hint:
        snapshot.rsi14 === null
          ? undefined
          : snapshot.rsi14 > 70
            ? 'Overbought'
            : snapshot.rsi14 < 30
              ? 'Oversold'
              : 'Neutral',
      color:
        snapshot.rsi14 === null
          ? undefined
          : snapshot.rsi14 > 70
            ? 'var(--warn)'
            : snapshot.rsi14 < 30
              ? 'var(--bear)'
              : undefined,
    },
    {
      label: 'ADX (14)',
      value: snapshot.adx14 !== null ? snapshot.adx14.toFixed(1) : '—',
      hint: snapshot.adx14 === null ? undefined : snapshot.adx14 > 25 ? 'Trending' : 'Choppy',
      color: snapshot.adx14 !== null && snapshot.adx14 < 20 ? 'var(--warn)' : undefined,
    },
    {
      label: 'ATR (14)',
      value: snapshot.atr14 !== null ? inr(snapshot.atr14) : '—',
      hint:
        snapshot.atr14 !== null
          ? `${((snapshot.atr14 / snapshot.price) * 100).toFixed(1)}% of price`
          : undefined,
    },
    {
      label: 'Volume vs 20d',
      value: snapshot.volumeRatio !== null ? `${snapshot.volumeRatio.toFixed(2)}x` : '—',
      hint: compactVolume(snapshot.volume),
      color:
        snapshot.volumeRatio !== null && snapshot.volumeRatio > 1.5 ? 'var(--bull)' : undefined,
    },
    {
      label: '5-day change',
      value: pct(snapshot.roc5, 2, true),
      color:
        snapshot.roc5 === null ? undefined : snapshot.roc5 >= 0 ? 'var(--bull)' : 'var(--bear)',
    },
    {
      label: '20-day change',
      value: pct(snapshot.roc20, 2, true),
      color:
        snapshot.roc20 === null ? undefined : snapshot.roc20 >= 0 ? 'var(--bull)' : 'var(--bear)',
    },
    {
      label: 'From 52w high',
      value: pct(levels.pctFrom52High, 1, true),
      hint: levels.week52High ? inr(levels.week52High, 0) : undefined,
    },
    {
      label: 'Market cap',
      value: marketCap(company.quote.marketCap),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-[var(--surface)] px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{it.label}</p>
          <p className="tnum mt-1 text-lg font-semibold" style={it.color ? { color: it.color } : undefined}>
            {it.value}
          </p>
          {it.hint && <p className="text-[11px] text-[var(--muted)]">{it.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ levels */

/**
 * `bare` drops the panel's own border and heading for use inside a Collapsible,
 * which already supplies both.
 */
export function LevelsPanel({
  levels,
  price,
  bare = false,
}: {
  levels: Levels;
  price: number;
  bare?: boolean;
}) {
  const Wrapper = bare ? 'div' : 'section';

  return (
    <Wrapper className={bare ? '' : 'rounded-xl border border-[var(--border)] bg-[var(--surface)]'}>
      {!bare && (
        <header className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Key levels</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Swing highs and lows from the past two years, nearest first.
          </p>
        </header>
      )}

      <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
        <LevelColumn
          title="Resistance (above)"
          levels={levels.resistance}
          price={price}
          color="var(--bear)"
        />
        <LevelColumn
          title="Support (below)"
          levels={levels.support}
          price={price}
          color="var(--bull)"
        />
      </div>

      <div className="flex justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
        <span>
          52w low <span className="tnum text-[var(--foreground)]">{inr(levels.week52Low, 0)}</span>
          {levels.pctFrom52Low !== null && ` (${pct(levels.pctFrom52Low, 1, true)})`}
        </span>
        <span>
          52w high <span className="tnum text-[var(--foreground)]">{inr(levels.week52High, 0)}</span>
          {levels.pctFrom52High !== null && ` (${pct(levels.pctFrom52High, 1, true)})`}
        </span>
      </div>
    </Wrapper>
  );
}

function LevelColumn({
  title,
  levels,
  price,
  color,
}: {
  title: string;
  levels: number[];
  price: number;
  color: string;
}) {
  return (
    <div className="bg-[var(--surface)] px-5 py-4">
      <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{title}</p>
      {levels.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">None identified in range.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {levels.map((l) => (
            <li key={l} className="flex items-center justify-between text-sm">
              <span className="tnum">{inr(l)}</span>
              <span className="tnum text-xs" style={{ color }}>
                {pct(((l - price) / price) * 100, 1, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ fundamentals */

export function FundamentalsPanel({ f, bare = false }: { f: Fundamentals; bare?: boolean }) {
  const rows: { label: string; value: string }[] = [
    { label: 'P/E (trailing)', value: num(f.peRatio) },
    { label: 'P/E (forward)', value: num(f.forwardPE) },
    { label: 'PEG ratio', value: num(f.pegRatio) },
    { label: 'Price / Book', value: num(f.priceToBook) },
    { label: 'Book value', value: inr(f.bookValue) },
    { label: 'EPS (TTM)', value: inr(f.eps) },
    { label: 'Return on equity', value: fracPct(f.returnOnEquity) },
    { label: 'Debt / Equity', value: num(f.debtToEquity) },
    { label: 'Operating margin', value: fracPct(f.operatingMargin) },
    { label: 'Profit margin', value: fracPct(f.profitMargin) },
    { label: 'Revenue growth', value: fracPct(f.revenueGrowth) },
    { label: 'Earnings growth', value: fracPct(f.earningsGrowth) },
    { label: 'Promoter holding', value: fracPct(f.promoterHolding) },
    { label: 'Institutional holding', value: fracPct(f.institutionalHolding) },
    { label: 'Beta', value: num(f.beta) },
    { label: 'Dividend yield', value: fracPct(f.dividendYield) },
  ];

  const missing = rows.filter((r) => r.value === '—').length;
  const Wrapper = bare ? 'div' : 'section';

  return (
    <Wrapper className={bare ? '' : 'rounded-xl border border-[var(--border)] bg-[var(--surface)]'}>
      {!bare && (
        <header className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Fundamentals</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Context only — these do not feed the swing score.
            {missing > 0 &&
              ` ${missing} field${missing > 1 ? 's' : ''} unavailable for this listing.`}
          </p>
        </header>
      )}

      <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className="bg-[var(--surface)] px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{r.label}</p>
            <p className="tnum mt-0.5 text-sm font-medium">{r.value}</p>
          </div>
        ))}
      </div>

      {bare && missing > 0 && (
        <p className="px-5 py-3 text-xs text-[var(--muted)]">
          {missing} field{missing > 1 ? 's are' : ' is'} unavailable for this listing — Yahoo&apos;s
          fundamentals coverage of Indian stocks is patchy.
        </p>
      )}
    </Wrapper>
  );
}

/* ---------------------------------------------------------------- analysts */

export function AnalystPanel({
  a,
  price,
  bare = false,
}: {
  a: AnalystView;
  price: number;
  bare?: boolean;
}) {
  const total = a.strongBuy + a.buy + a.hold + a.sell + a.strongSell;
  if (!total && !a.targetMean) {
    return bare ? (
      <p className="px-5 py-4 text-sm text-[var(--muted)]">
        No analyst coverage available for this stock.
      </p>
    ) : null;
  }

  const bars = [
    { label: 'Strong buy', n: a.strongBuy, color: 'var(--bull)' },
    { label: 'Buy', n: a.buy, color: '#4ade80' },
    { label: 'Hold', n: a.hold, color: 'var(--warn)' },
    { label: 'Sell', n: a.sell, color: '#fb7185' },
    { label: 'Strong sell', n: a.strongSell, color: 'var(--bear)' },
  ];

  const upside = a.targetMean ? ((a.targetMean - price) / price) * 100 : null;

  const Wrapper = bare ? 'div' : 'section';

  return (
    <Wrapper
      className={
        bare
          ? 'px-4 py-3'
          : 'rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4'
      }
    >
      {!bare && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wider">Analyst consensus</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Sell-side views on a 12-month horizon — far longer than a swing trade, so treat this as
            background, not a trigger.
          </p>
        </>
      )}

      {total > 0 && (
        <div className="mt-4 space-y-2">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-[var(--muted)]">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(b.n / total) * 100}%`, background: b.color }}
                />
              </div>
              <span className="tnum w-6 text-right">{b.n}</span>
            </div>
          ))}
        </div>
      )}

      {a.targetMean && (
        <div className="mt-4 flex flex-wrap gap-6 border-t border-[var(--border)] pt-3 text-sm">
          <span className="text-[var(--muted)]">
            Mean target <span className="tnum text-[var(--foreground)]">{inr(a.targetMean)}</span>
          </span>
          {upside !== null && (
            <span className="text-[var(--muted)]">
              Implied{' '}
              <span
                className="tnum font-medium"
                style={{ color: upside >= 0 ? 'var(--bull)' : 'var(--bear)' }}
              >
                {pct(upside, 1, true)}
              </span>
            </span>
          )}
          <span className="text-[var(--muted)]">
            Range{' '}
            <span className="tnum text-[var(--foreground)]">
              {inr(a.targetLow, 0)} – {inr(a.targetHigh, 0)}
            </span>
          </span>
          {a.numberOfAnalysts && (
            <span className="text-[var(--muted)]">
              <span className="tnum text-[var(--foreground)]">{a.numberOfAnalysts}</span> analysts
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}

/* ------------------------------------------------------------------- risks */

export function RiskPanel({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-5 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--warn)]">
        Risk flags
      </h2>
      <ul className="mt-3 space-y-2">
        {flags.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-[var(--muted)]">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--warn)]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
