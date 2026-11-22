/**
 * Per-stock news via Google News RSS. No API key, no account — just a public
 * RSS endpoint, parsed by hand because the fields we need are shallow.
 *
 * Relevance and attribution matter more than volume:
 *  - the query uses the company's cleaned name as a quoted phrase;
 *  - a headline is kept only when it names the company (full name, ticker or a
 *    known headline alias). Headlines that share only a first word, such as a
 *    group name, are kept but labelled for checking; the rest are dropped and
 *    counted, so the reader knows filtering happened;
 *  - near-identical syndicated headlines are merged, keeping the other outlets;
 *  - publication time, article age and feed retrieval time are separate facts.
 *
 * Headlines are untrusted text. They are displayed as text only, links must be
 * http(s), and nothing here infers that a headline caused a price move.
 */

import { UNIVERSE } from './universe';

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  /** Publisher site from the feed's `<source url>`, when supplied. */
  sourceDomain: string | null;
  publishedAt: string | null;
  ageHours: number | null;
  /** `name`: the headline names the company; `partial`: only a shared first word matched. */
  match: 'name' | 'partial';
  /** Other outlets that carried a near-identical headline. */
  alsoReportedBy: string[];
}

export interface NewsResult {
  /** All kept items, newest first. Retained for older clients. */
  items: NewsItem[];
  /** Published within the last 7 days. */
  recent: NewsItem[];
  /** Published more than 7 days ago (broader fallback searches). */
  older: NewsItem[];
  undated: NewsItem[];
  status: 'ok' | 'empty' | 'error';
  error?: string;
  /** When the feed was retrieved (origin Date header when available). */
  fetchedAt: string;
  tier: '7d' | '30d' | 'any' | null;
  query: string | null;
  aliases: string[];
  /** Results dropped because the headline did not name the company. */
  filteredOut: number;
  /** Syndicated near-duplicates merged into another item. */
  duplicatesMerged: number;
}

const RSS_BASE = 'https://news.google.com/rss/search';
const RECENT_HOURS = 7 * 24;
const MIN_RELEVANT = 4;

/**
 * Query tiers, tried in order until enough relevant items come back. Google's
 * `when:` operator is what buys freshness; the unconstrained tier is a floor so
 * a quiet small-cap can still show older context, clearly grouped as older.
 */
const TIERS: { id: '7d' | '30d' | 'any'; when: string | null }[] = [
  { id: '7d', when: '7d' },
  { id: '30d', when: '30d' },
  { id: 'any', when: null },
];

/** Headline forms that differ from the listed name. Identity only, never data. */
const HEADLINE_ALIASES: Record<string, string[]> = {
  'RELIANCE.NS': ['RIL'],
  'SBIN.NS': ['SBI'],
  'LT.NS': ['L&T', 'Larsen & Toubro', 'Larsen and Toubro'],
  'HINDUNILVR.NS': ['HUL', 'Hindustan Unilever'],
  'M&M.NS': ['M&M', 'Mahindra & Mahindra', 'Mahindra and Mahindra'],
  'BHARTIARTL.NS': ['Bharti Airtel', 'Airtel'],
  'HCLTECH.NS': ['HCLTech', 'HCL Tech'],
  'TMCV.NS': ['Tata Motors'],
  'TMPV.NS': ['Tata Motors'],
  'MARUTI.NS': ['Maruti'],
  'BAJAJ-AUTO.NS': ['Bajaj Auto'],
  'DRREDDY.NS': ["Dr Reddy's", 'Dr Reddys'],
  'KOTAKBANK.NS': ['Kotak Mahindra Bank', 'Kotak Bank'],
  'ULTRACEMCO.NS': ['UltraTech'],
  'POWERGRID.NS': ['Power Grid'],
};

/** First words too generic to suggest the company on their own. */
const GENERIC_FIRST_WORDS = new Set(['the', 'india', 'indian', 'bank', 'state', 'national', 'new', 'first', 'united', 'power', 'great', 'global']);

const normalise = (s: string) =>
  s.replace(/[’‘`´]/g, "'").replace(/\./g, '').replace(/\s+/g, ' ').trim();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(title: string, name: string, caseSensitive = false): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, caseSensitive ? 'u' : 'iu');
  return re.test(title);
}

export interface CompanyAliases {
  /** Cleaned listed name used for the query. */
  primary: string;
  names: string[];
  ticker: string | null;
  partial: string | null;
}

export function companyAliases(company: string, symbol?: string | null): CompanyAliases {
  const cleaned = normalise(
    company
      .replace(/\([^)]*\)/g, ' ')
      .replace(/(\s+(limited|ltd|pvt|private|company|inc|plc|corporation|corp)\.?)+\s*$/i, ''),
  ).replace(/[,\s]+$/, '');
  const primary = cleaned || normalise(company);
  const key = symbol ? symbol.toUpperCase().replace(/\.BO$/, '.NS') : null;
  const universeName = key ? UNIVERSE.find((u) => u.symbol === key)?.name ?? null : null;
  const names = [...new Set([primary, ...(universeName ? [normalise(universeName)] : []), ...(key ? HEADLINE_ALIASES[key] ?? [] : []).map(normalise)])]
    .filter((n) => n.length >= 3 || /^[A-Z&]{2,}$/.test(n));
  const base = key ? key.replace(/\.(NS|BO)$/, '') : null;
  const ticker = base && base.length >= 3 && /^[A-Z0-9&-]+$/.test(base) ? base : null;
  const words = primary.split(' ');
  const first = words[0] ?? '';
  const partial = words.length >= 2 && first.length >= 3 && !GENERIC_FIRST_WORDS.has(first.toLowerCase()) ? first : null;
  return { primary, names, ticker, partial };
}

interface RawItem {
  title: string;
  link: string;
  source: string;
  sourceDomain: string | null;
  publishedAt: string | null;
  ageHours: number | null;
}

export async function fetchCompanyNews(
  company: string,
  opts: { symbol?: string | null; fresh?: boolean; limit?: number } = {},
): Promise<NewsResult> {
  const aliases = companyAliases(company, opts.symbol);
  const limit = opts.limit ?? 10;
  let best: { tier: '7d' | '30d' | 'any'; items: NewsItem[]; filteredOut: number; merged: number; fetchedAt: string; query: string } | null = null;
  let lastError: unknown = null;

  for (const tier of TIERS) {
    const query = `"${aliases.primary.replace(/"/g, '')}" stock${tier.when ? ` when:${tier.when}` : ''}`;
    try {
      const feed = await fetchFeed(query, opts.fresh ?? false);
      const { kept, filteredOut } = classify(feed.items, aliases);
      const { items, merged } = dedupe(kept);
      if (!best || items.length > best.items.length) best = { tier: tier.id, items, filteredOut, merged, fetchedAt: feed.fetchedAt, query };
      if (best.items.length >= MIN_RELEVANT) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!best) throw lastError ?? new Error('News feed unavailable');
  const items = best.items.slice(0, limit);
  return {
    items,
    recent: items.filter((i) => i.ageHours !== null && i.ageHours <= RECENT_HOURS),
    older: items.filter((i) => i.ageHours !== null && i.ageHours > RECENT_HOURS),
    undated: items.filter((i) => i.ageHours === null),
    status: items.length ? 'ok' : 'empty',
    fetchedAt: best.fetchedAt,
    tier: best.tier,
    query: best.query,
    aliases: [...aliases.names, ...(aliases.ticker ? [aliases.ticker] : [])],
    filteredOut: best.filteredOut,
    duplicatesMerged: best.merged,
  };
}

/** Compatibility wrapper: the kept headlines only. */
export async function fetchNews(company: string, limit = 8, opts: { fresh?: boolean; symbol?: string | null } = {}): Promise<NewsItem[]> {
  return (await fetchCompanyNews(company, { ...opts, limit })).items;
}

async function fetchFeed(query: string, fresh: boolean): Promise<{ items: RawItem[]; fetchedAt: string }> {
  const url = `${RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (NIVRA news reader)' },
    signal: AbortSignal.timeout(8000),
    // Normally news tolerates being a few minutes stale, so let the platform
    // cache it. An explicit refresh bypasses that cache for a genuinely fresh pull.
    ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 600 } }),
  });
  if (!res.ok) throw new Error(`News feed returned ${res.status}`);
  const header = res.headers.get('date');
  const parsed = header ? Date.parse(header) : NaN;
  const fetchedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();

  // Google ranks by relevance, not date. Sort newest first; undated items last.
  const items = parseRss(await res.text()).sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    return tb - ta;
  });
  return { items, fetchedAt };
}

function classify(items: RawItem[], aliases: CompanyAliases): { kept: NewsItem[]; filteredOut: number } {
  const kept: NewsItem[] = [];
  let filteredOut = 0;
  for (const item of items) {
    const title = normalise(item.title);
    const named = aliases.names.some((n) => mentions(title, n)) || (aliases.ticker !== null && mentions(title, aliases.ticker, true));
    const partial = !named && aliases.partial !== null && mentions(title, aliases.partial);
    if (!named && !partial) {
      filteredOut++;
      continue;
    }
    kept.push({ ...item, match: named ? 'name' : 'partial', alsoReportedBy: [] });
  }
  return { kept, filteredOut };
}

const tokens = (title: string) =>
  new Set(title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));

/**
 * Syndicated copy appears under near-identical headlines. Items are already
 * newest first, so the newest copy is kept and the other outlets are listed.
 */
function dedupe(items: NewsItem[]): { items: NewsItem[]; merged: number } {
  const out: { item: NewsItem; words: Set<string>; key: string }[] = [];
  let merged = 0;
  for (const item of items) {
    const words = tokens(item.title);
    const key = [...words].join(' ').slice(0, 60);
    const twin = out.find((o) => {
      if (key && o.key === key) return true;
      const inter = [...words].filter((w) => o.words.has(w)).length;
      const union = new Set([...words, ...o.words]).size;
      return union > 0 && inter / union >= 0.75;
    });
    if (twin) {
      merged++;
      if (item.source && item.source !== twin.item.source && !twin.item.alsoReportedBy.includes(item.source)) {
        twin.item.alsoReportedBy.push(item.source);
      }
      continue;
    }
    out.push({ item, words, key });
  }
  return { items: out.map((o) => o.item), merged };
}

function parseRss(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const now = Date.now();

  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const rawTitle = tag(block, 'title');
    const link = clean(tag(block, 'link'));
    if (!rawTitle || !/^https?:\/\//i.test(link)) continue;

    // Google appends " - <Source>" to headlines; the <source> tag repeats it.
    const sourceMatch = block.match(/<source([^>]*)>([\s\S]*?)<\/source>/);
    const source = clean(sourceMatch?.[2] ?? '') || trailingSource(clean(rawTitle));
    const urlAttr = sourceMatch?.[1].match(/url="([^"]*)"/)?.[1] ?? null;
    let sourceDomain: string | null = null;
    if (urlAttr) {
      try {
        sourceDomain = new URL(clean(urlAttr)).hostname.replace(/^www\./, '');
      } catch {
        sourceDomain = null;
      }
    }
    const title = clean(rawTitle).replace(/\s+-\s+[^-]+$/, '').trim();
    const pub = tag(block, 'pubDate');
    const time = pub ? Date.parse(clean(pub)) : NaN;
    const publishedAt = Number.isFinite(time) ? new Date(time).toISOString() : null;
    const ageHours = publishedAt ? Math.max(0, Math.round((now - time) / 3_600_000)) : null;

    if (title) items.push({ title, link, source, sourceDomain, publishedAt, ageHours });
  }

  return items;
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return m ? m[1] : '';
}

function trailingSource(title: string): string {
  const m = title.match(/\s+-\s+([^-]+)$/);
  return m ? m[1].trim() : 'Google News';
}

/** Strip CDATA wrappers and markup, and decode the entities RSS uses. */
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeChar(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function safeChar(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}
