'use client';

import type { ActionPlan } from '@/lib/timeframes';
import { inr } from '@/lib/format';

/**
 * The horizon-appropriate "what to actually do" box. The detailed sizing
 * calculator (TradePlanCard) only makes sense when there's a hard stop, so the
 * long-term view — which has no price stop, only a thesis — shows this instead.
 */
export default function ActionCard({ action }: { action: ActionPlan }) {
  const hasZone = action.entryLow !== null && action.entryHigh !== null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider">What to do</h2>
      <p className="mt-2 text-[15px] font-medium">{action.headline}</p>

      {(hasZone || action.stopLoss !== null || action.target1 !== null) && (
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {hasZone && (
            <Field
              label="Accumulation zone"
              value={`${inr(action.entryLow)} – ${inr(action.entryHigh)}`}
            />
          )}
          {action.stopLoss !== null && (
            <Field label="Stop" value={inr(action.stopLoss)} color="var(--bear)" />
          )}
          {action.target1 !== null && (
            <Field label="Target" value={inr(action.target1)} color="var(--bull)" />
          )}
        </div>
      )}

      {action.note && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{action.note}</p>
      )}
    </section>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="text-[var(--muted)]">
      {label}{' '}
      <span className="tnum font-semibold" style={color ? { color } : { color: 'var(--foreground)' }}>
        {value}
      </span>
    </span>
  );
}
