/** Reports universe symbols Yahoo can no longer serve, so the list can be pruned. */
import YahooFinance from 'yahoo-finance2';
import { readFileSync } from 'node:fs';

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  validation: { logErrors: false, logOptionsErrors: false, allowAdditionalProps: true },
  queue: { concurrency: 8 },
});

const src = readFileSync(new URL('../src/lib/universe.ts', import.meta.url), 'utf8');
const symbols = [...src.matchAll(/symbol:\s*'([^']+)'/g)].map((m) => m[1]).filter((s) => s !== '^NSEI');

const from = new Date();
from.setFullYear(from.getFullYear() - 1);

const bad = [];
await Promise.all(
  symbols.map(async (sym) => {
    try {
      const c = await yf.chart(sym, { period1: from, interval: '1d' });
      const usable = (c.quotes ?? []).filter((q) => q.close != null && q.volume != null).length;
      if (usable < 60) bad.push(`${sym} (only ${usable} bars)`);
    } catch (e) {
      bad.push(`${sym} (${e.message.slice(0, 60)})`);
    }
  }),
);

console.log(`Checked ${symbols.length} symbols.`);
console.log(bad.length ? `\nUnusable:\n${bad.map((b) => '  ' + b).join('\n')}` : '\nAll usable.');
