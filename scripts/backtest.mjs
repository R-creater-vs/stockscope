/**
 * Runs the universe backtest study via the running dev server and prints a plain
 * report. Start the app first (`npm run dev`), then `npm run backtest`.
 *
 * This is deliberately a thin client over `/api/backtest-study` so the CLI and
 * the in-app "Strategy check" tab always show identical numbers.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const money = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function printStudy(title, t) {
  console.log(`\n  ${title}`);
  console.log(
    `    trades=${t.trade.trades}  win=${t.trade.winRate.toFixed(1)}%  ` +
      `expectancy=${t.trade.expectancyR >= 0 ? '+' : ''}${t.trade.expectancyR.toFixed(3)}R  ` +
      `profitFactor=${t.trade.profitFactor.toFixed(2)}  avgRet/trade=${money(t.trade.avgReturnPct)}`,
  );
}

async function main() {
  console.log(`Running universe backtest study via ${BASE} … (about 2 minutes)`);
  const res = await fetch(`${BASE}/api/backtest-study`, { signal: AbortSignal.timeout(540_000) });
  if (!res.ok) {
    console.error(`Study request failed: HTTP ${res.status}. Is the dev server running?`);
    process.exit(1);
  }
  const { study, studyRegimeFiltered, durationMs } = await res.json();

  console.log(`\n=== UNIVERSE BACKTEST STUDY (${Math.round(durationMs / 1000)}s, ${study.symbolsTested} stocks) ===`);

  console.log(`\nSIGNAL STUDY — does a higher score predict a higher ${study.signal.horizon}-day return?`);
  console.log(`  pooled correlation = ${study.signal.correlation.toFixed(4)}   (0 = no signal; >0 = predictive)`);
  for (const b of study.signal.buckets) {
    console.log(
      `    ${b.label.padEnd(14)} n=${String(b.n).padStart(6)}  avgFwd=${money(b.avgForwardReturnPct).padStart(8)}  win=${b.winRate.toFixed(1)}%`,
    );
  }

  console.log(`\nTRADE STUDY (long-only, next-open entry, ${study.config.costPct}% round-trip cost):`);
  printStudy('Take every signal', study);
  if (studyRegimeFiltered) printStudy('Long only when Nifty > 50-EMA', studyRegimeFiltered);

  const works = study.signal.correlation > 0.05 && study.trade.expectancyR > 0.03;
  console.log(`\nVERDICT: ${works ? 'positive edge detected.' : 'no reliable edge found — the score is not predictive over this sample.'}`);
  console.log('(A backtest that tells you the strategy does not work has done its job.)\n');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
