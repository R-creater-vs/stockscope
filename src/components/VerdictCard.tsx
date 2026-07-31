'use client';

import type { Verdict } from '@/lib/swing';
import type { TimeframeAnalysis } from '@/lib/timeframes';
import { validationNote } from '@/lib/validation';

const STYLE: Record<Verdict, { color: string; bg: string }> = {
  STRONG_BUY: { color: 'var(--bull)', bg: 'rgba(38,208,124,0.10)' },
  BUY: { color: 'var(--bull)', bg: 'rgba(38,208,124,0.07)' },
  HOLD: { color: 'var(--warn)', bg: 'rgba(246,167,35,0.08)' },
  AVOID: { color: 'var(--bear)', bg: 'rgba(246,70,93,0.08)' },
};

/** The score axis is technical for short/mid, fundamental for long. */
function scoreLabel(tf: TimeframeAnalysis): string {
  return tf.timeframe === 'long' ? 'Fundamental score' : 'Technical score';
}

export default function VerdictCard({ tf }: { tf: TimeframeAnalysis }) {
  const style = STYLE[tf.verdict];
  // The engine's own track record travels with the verdict. Showing a confident
  // "STRONG BUY" while the backtest says that bucket underperformed would be
  // the single most misleading thing this app could do.
  const validation = validationNote(tf.timeframe);

  return (
    <div className="rounded-xl border p-6" style={{ borderColor: style.color, background: style.bg }}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            {tf.label} verdict · {tf.horizon.toLowerCase()}
          </p>
          <p
            className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: style.color }}
          >
            {tf.verdictLabel}
          </p>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{tf.approach}</p>
        </div>

        <div className="flex gap-6 sm:gap-8">
          <Metric label={scoreLabel(tf)} value={`${tf.score}`} suffix="/100" color={style.color} />
          <Metric label="Confidence" value={`${tf.confidence}%`} suffix={tf.confidenceLabel} />
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${tf.score}%`, background: style.color }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
          <span>Avoid</span>
          <span>Hold</span>
          <span>Buy</span>
          <span>Strong</span>
        </div>
      </div>

      {tf.dataNote && (
        <p className="mt-4 rounded-md border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-3 py-2 text-xs text-[var(--muted)]">
          {tf.dataNote}
        </p>
      )}

      {(() => {
        // Three states, three colours: green = backtested edge, amber = tested
        // but no stable edge (regime-dependent), red = inverted / no edge.
        const tone =
          validation.status === 'validated'
            ? { c: 'var(--bull)', rgb: '38,208,124', label: 'Backtested' }
            : validation.status === 'regime-dependent'
              ? { c: 'var(--warn)', rgb: '246,167,35', label: 'No stable edge' }
              : { c: 'var(--bear)', rgb: '246,70,93', label: 'Unvalidated' };
        return (
          <p
            className="mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed text-[var(--muted)]"
            style={{ borderColor: `rgba(${tone.rgb},0.3)`, background: `rgba(${tone.rgb},0.05)` }}
          >
            <strong className="uppercase tracking-wider" style={{ color: tone.c }}>
              {tone.label}
            </strong>{' '}
            {validation.text}
          </p>
        );
      })()}
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string;
  suffix?: string;
  color?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="mt-1 tnum text-3xl font-semibold" style={color ? { color } : undefined}>
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-[var(--muted)]">{suffix}</span>}
      </p>
    </div>
  );
}
