'use client';

import type { NewsItem, NewsResult } from '@/lib/news';
import { useCompanyNews, type NewsState } from '@/lib/useNews';

const ist = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function ago(hours: number | null): string {
  if (hours === null) return '';
  if (hours < 1) return 'under an hour old';
  if (hours < 24) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

/** Official exchange pages for verifying material events. Links only; nothing is scraped. */
function FilingLinks({ symbol }: { symbol: string | null }) {
  const links: { label: string; href: string }[] = [];
  if (symbol?.endsWith('.NS')) {
    const base = symbol.slice(0, -3);
    links.push({ label: `NSE quote page for ${base} (announcements and filings)`, href: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(base)}` });
  }
  links.push({ label: 'BSE corporate announcements (search the company)', href: 'https://www.bseindia.com/corporates/ann.html' });
  return (
    <div className="border-t border-[var(--border)]">
      <p className="px-5 pt-3 text-xs text-[var(--muted)]">Verify material events in exchange filings, which are the primary source:</p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-3 px-5 py-2 text-sm text-[var(--accent)] hover:bg-[var(--surface-2)]">
              <span>{l.label}<span className="sr-only"> (opens the exchange website in a new tab)</span></span>
              <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewsRow({ n }: { n: NewsItem }) {
  return (
    <li>
      <a href={n.link} target="_blank" rel="noopener noreferrer" className="block min-h-11 px-5 py-3 transition hover:bg-[var(--surface-2)]">
        <p className="text-sm leading-snug">
          {n.title}
          <span className="sr-only"> (opens in a new tab)</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
          <span>{n.source}</span>
          {n.sourceDomain && n.sourceDomain.toLowerCase() !== n.source.toLowerCase() && (
            <>
              <span aria-hidden>·</span>
              <span>{n.sourceDomain}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{n.publishedAt ? `Published ${ist(n.publishedAt)} IST` : 'Publication time not supplied'}</span>
          {n.ageHours !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{ago(n.ageHours)}</span>
            </>
          )}
          <span aria-hidden className="ml-auto opacity-60">↗</span>
        </p>
        {n.match === 'partial' && (
          <p className="mt-1 text-xs text-[var(--warn)]">The headline matches only part of the company name. Check that it refers to this company.</p>
        )}
        {n.alsoReportedBy.length > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            A near-identical headline was also carried by {n.alsoReportedBy.slice(0, 3).join(', ')}
            {n.alsoReportedBy.length > 3 ? ` and ${n.alsoReportedBy.length - 3} more` : ''}.
          </p>
        )}
      </a>
    </li>
  );
}

function NewsGroup({ title, subtitle, items, empty }: { title: string; subtitle?: string; items: NewsItem[]; empty?: string }) {
  return (
    <div className="border-t border-[var(--border)] first:border-t-0">
      <div className="px-5 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-3 text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">{items.map((n) => <NewsRow key={n.link} n={n} />)}</ul>
      )}
    </div>
  );
}

function searchNote(result: NewsResult): string {
  const parts: string[] = [];
  if (result.filteredOut > 0) parts.push(`${result.filteredOut} result${result.filteredOut === 1 ? ' was' : 's were'} hidden because the headline did not name the company.`);
  if (result.duplicatesMerged > 0) parts.push(`${result.duplicatesMerged} near-identical syndicated headline${result.duplicatesMerged === 1 ? ' was' : 's were'} merged.`);
  return parts.join(' ');
}

/** Presentational list shared by the company news section and the weeks-to-months brief. */
export function NewsList({ state, company, symbol }: { state: NewsState; company: string; symbol: string | null }) {
  const { result, loading, failed, retry } = state;

  if (!result && loading) {
    return (
      <div className="space-y-2 p-4" role="status" aria-label="Loading news headlines">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <div className="px-5 py-4 text-sm text-[var(--muted)]">
          <p role="alert">Could not load news right now. The rest of the report is unaffected.</p>
          <button className="btn-glass mt-3" onClick={retry}>Retry news</button>
        </div>
        <FilingLinks symbol={symbol} />
      </div>
    );
  }

  return (
    <div>
      {failed && (
        <div className="notice mx-4 mt-4" role="alert">
          <span>News refresh failed. Showing headlines retrieved {ist(result.fetchedAt)} IST; they may be out of date.</span>
          <button onClick={retry}>Retry</button>
        </div>
      )}
      {loading && <p role="status" className="px-5 pt-3 text-xs text-[var(--muted)]">Refreshing headlines…</p>}
      {result.status === 'empty' ? (
        <div className="px-5 py-4 text-sm text-[var(--muted)]">
          <p>No headline naming {company} was found in Google News searches covering the last 7 days, the last 30 days and older articles.</p>
          {searchNote(result) && <p className="mt-2 text-xs">{searchNote(result)}</p>}
        </div>
      ) : (
        <>
          <NewsGroup title="Last 7 days" items={result.recent} empty="No headline from the last 7 days names this company." />
          {result.older.length > 0 && <NewsGroup title="Older" subtitle="From the broader 30-day or unrestricted search" items={result.older} />}
          {result.undated.length > 0 && <NewsGroup title="Undated" subtitle="The feed supplied no publication time" items={result.undated} />}
        </>
      )}
      <div className="space-y-1 border-t border-[var(--border)] px-5 py-3 text-[11px] leading-relaxed text-[var(--muted)]">
        <p>
          Google News search for “{company}”; feed retrieved {ist(result.fetchedAt)} IST. Normal loads may reuse a copy up to 10 minutes old; Refresh requests a new one.
          {result.status !== 'empty' && searchNote(result) ? ` ${searchNote(result)}` : ''}
        </p>
        <p>Headlines are leads to verify, not facts. NIVRA does not summarise articles or judge their impact, and the timing of a headline does not show that it moved the price.</p>
      </div>
      <FilingLinks symbol={symbol} />
    </div>
  );
}

export default function NewsPanel({ company, symbol = null, refreshKey = 0 }: { company: string; symbol?: string | null; refreshKey?: number }) {
  const state = useCompanyNews(company, symbol, refreshKey);
  return <NewsList state={state} company={company} symbol={symbol} />;
}
