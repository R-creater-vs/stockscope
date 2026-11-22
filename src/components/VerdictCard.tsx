'use client';

import type { Verdict } from '@/lib/swing';
import type { TimeframeAnalysis } from '@/lib/timeframes';
import { ENGINE_VALIDATION } from '@/lib/validation';

/** Display descriptions only. API verdicts and score thresholds are unchanged. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_BUY: 'Strong bullish bias',
  BUY: 'Bullish bias',
  HOLD: 'Mixed evidence',
  AVOID: 'Bearish bias',
};

const COLOR: Record<Verdict, string> = {
  STRONG_BUY: 'var(--bull)', BUY: 'var(--bull)', HOLD: 'var(--warn)', AVOID: 'var(--bear)',
};

export default function VerdictCard({ tf }: { tf: TimeframeAnalysis }) {
  const color = COLOR[tf.verdict];
  const evidence = ENGINE_VALIDATION[tf.timeframe];
  return (
    <section aria-label="Setup assessment" className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {tf.label} assessment · {tf.horizon.toLowerCase()}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color }}>
              {VERDICT_LABEL[tf.verdict]}
            </h2>
            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{tf.approach}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-5 border-t border-[var(--border)] pt-4 sm:w-auto sm:border-0 sm:pt-0">
            <Metric label={tf.timeframe === 'long' ? 'Fundamental score' : 'Technical score'} value={String(tf.score)} suffix="/100" color={color} />
            <Metric label="Confidence" value={String(tf.confidence)} suffix="/100" />
          </div>
        </div>
        <div className="mt-5" aria-hidden="true">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${tf.score}%`, background: color }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--muted)]"><span>Bearish rules</span><span>Mixed</span><span>Bullish rules</span></div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          Score describes the direction of the rules. Confidence is {tf.confidenceLabel.toLowerCase()}:
          {' '}{tf.timeframe === 'long' ? 'signal agreement and data completeness' : 'signal agreement and trend clarity'}
          {tf.timeframe === 'short' ? ', adjusted for weekly agreement' : ''}. It is not a probability of profit.
        </p>
        {tf.dataNote && <p className="mt-3 text-sm leading-relaxed text-[var(--warn)]">{tf.dataNote}</p>}
      </div>
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-4 sm:px-6">
        <p className="text-sm font-semibold text-[var(--warn)]">
          {evidence.isProxy ? 'Fundamental model not validated' : 'No demonstrated edge'}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {tf.timeframe === 'short'
            ? 'The weighted swing score has not demonstrated a stable trading edge. Historical results changed across tested periods. A bullish reading describes this setup; it does not establish a profitable trade.'
            : evidence.isProxy
              ? 'Historical testing covers a price-trend proxy only. It does not validate today’s fundamental score.'
              : tf.timeframe === 'mid'
                ? `The stored study (measured ${evidence.measuredOn}) found no reliable edge: over ${evidence.horizonDays}-session forward windows, higher scores were followed by lower average returns (correlation ${evidence.correlation.toFixed(3)}), and simulated trades averaged ${evidence.expectancyR.toFixed(3)}R after the assumed costs (profit factor ${evidence.profitFactor.toFixed(2)}). That negative association does not validate an inverse strategy. A bullish reading describes the rules, not a return forecast.`
                : 'The stored historical study did not establish a reliable trading edge. A bullish reading is a description of the rules, not a return forecast.'}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Stored study: {evidence.symbols} stocks · {evidence.samples.toLocaleString('en-IN')} {tf.timeframe === 'mid' ? 'overlapping daily observations · about two years of decisions' : 'signal samples'} · {evidence.expectancyR.toFixed(3)}R per trade after assumed costs.
          {tf.timeframe === 'mid' ? ' The weeks-to-months evidence below is separate from this score and has not been tested.' : ''} Full assumptions in Strategy evidence.
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value, suffix, color }: { label: string; value: string; suffix: string; color?: string }) {
  return <div>
    <p className="text-xs text-[var(--muted)]">{label}</p>
    <p className="tnum mt-1 text-3xl font-semibold tracking-tight" style={color ? { color } : undefined}>
      {value}<span className="ml-1 text-sm font-normal text-[var(--muted)]">{suffix}</span>
    </p>
  </div>;
}
