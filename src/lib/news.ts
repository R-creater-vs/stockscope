/**
 * Per-stock news via Google News RSS. No API key, no account — just a public
 * RSS endpoint. We parse the XML by hand rather than pulling a dependency; the
 * format is stable and the fields we need are shallow.
 *
 * Relevance beats volume here: a targeted query ("<company> share NSE") returns
 * India-market coverage, where Yahoo's own news endpoint drifts to unrelated
 * sector names.
 */

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  ageHours: number | null;
}

const RSS_BASE = 'https://news.google.com/rss/search';

/**
 * Query tiers, tried in order until enough items come back.
 *
 * Google's `when:` operator is what actually buys freshness — without it the feed
 * ranks purely on relevance and will happily lead with a month-old article. The
 * unconstrained tier exists only as a floor so a quiet small-cap still shows
 * something rather than an empty panel.
 */
const QUERY_TIERS = [
  (co: string) => `${co} stock when:7d`,
  (co: string) => `${co} stock when:30d`,
  (co: string) => `${co} stock`,
];

const MIN_ITEMS = 4;

export async function fetchNews(
  company: string,
  limit = 8,
  opts: { fresh?: boolean } = {},
): Promise<NewsItem[]> {
  let best: NewsItem[] = [];
  let lastError: unknown = null;

  for (const buildQuery of QUERY_TIERS) {
    try {
      const items = await fetchTier(buildQuery(company), opts.fresh ?? false);
      if (items.length > best.length) best = items;
      if (best.length >= MIN_ITEMS) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (best.length === 0 && lastError) throw lastError;
  return best.slice(0, limit);
}

async function fetchTier(query: string, fresh = false): Promise<NewsItem[]> {
  const url = `${RSS_BASE}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (NIVRA news reader)' },
    signal: AbortSignal.timeout(8000),
    // Normally news tolerates being a few minutes stale, so let the platform
    // cache it. An explicit refresh bypasses that cache for a genuinely fresh pull.
    ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 600 } }),
  });
  if (!res.ok) throw new Error(`News feed returned ${res.status}`);

  // Google ranks by relevance, not date. A panel headed "latest news" must be
  // recency-ordered, so sort newest-first before slicing. Undated items sort
  // last rather than jumping the queue.
  const sorted = parseRss(await res.text()).sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : -Infinity;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : -Infinity;
    return tb - ta;
  });

  return dedupe(sorted);
}

/**
 * Syndicated wire copy shows up repeatedly under near-identical headlines (the
 * same "Stocks in news:" roundup from two outlets, say). Keying on a normalised
 * title keeps the newest copy and drops the echoes — sorting already put the
 * freshest first.
 */
function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    const key = item.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80); // prefix match catches truncation variants of one story
    if (key && seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];

  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const rawTitle = tag(block, 'title');
    const link = tag(block, 'link');
    if (!rawTitle || !link) continue;

    // Google appends " - <Source>" to headlines; the <source> tag repeats it.
    const source = tag(block, 'source') || trailingSource(rawTitle);
    const title = clean(rawTitle).replace(/\s+-\s+[^-]+$/, '').trim();
    const pub = tag(block, 'pubDate');
    const publishedAt = pub ? new Date(pub).toISOString() : null;
    const ageHours = publishedAt
      ? Math.max(0, Math.round((Date.now() - new Date(publishedAt).getTime()) / 3_600_000))
      : null;

    items.push({ title: clean(title), link: clean(link), source: clean(source), publishedAt, ageHours });
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

/** Strip CDATA wrappers and decode the handful of entities RSS actually uses. */
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
