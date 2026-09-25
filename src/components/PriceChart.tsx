'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bar as RBar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ema } from '@/lib/indicators';
import type { Bar } from '@/lib/indicators';
import type { Levels, TradePlan } from '@/lib/swing';
import { compactVolume, inr } from '@/lib/format';

const RANGES = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 130 },
  { label: '1Y', days: 260 },
] as const;

interface Props {
  bars: Bar[];
  levels: Levels;
  plan: TradePlan | null;
}

export default function PriceChart({ bars, levels, plan }: Props) {
  const [range, setRange] = useState<number>(130);
  const [tableOpen, setTableOpen] = useState(false);

  // EMAs are computed on the full series, then sliced — computing them on the
  // visible window alone would give different (wrong) values as you zoom.
  const data = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const rows = bars.map((b, i) => ({
      date: b.date,
      close: b.close,
      volume: b.volume,
      ema20: e20[i],
      ema50: e50[i],
      up: b.close >= b.open,
    }));
    return rows.slice(-range);
  }, [bars, range]);

  const closes = data.map((d) => d.close);
  const lo = closes.length ? Math.min(...closes) : 0;
  const hi = closes.length ? Math.max(...closes) : 0;
  const pad = (hi - lo) * 0.12 || 1;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" aria-label="Daily price history">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Price action</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Daily close with 20 &amp; 50-day EMAs. Plan levels are illustrative.
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              aria-pressed={range === r.days}
              aria-label={`${r.label} price history`}
              className={`min-h-11 min-w-11 rounded-md px-3 py-2 text-xs transition ${
                range === r.days
                  ? 'bg-[var(--accent)] font-semibold text-[var(--background)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-1 py-4 sm:px-2">
        {data.length === 0 ? <p className="grid h-80 place-items-center px-5 text-sm text-[var(--muted)]">No daily price history is available.</p> : <>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} accessibilityLayer>

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              minTickGap={48}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              }
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={[lo - pad, hi + pad]}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <YAxis yAxisId="vol" hide domain={[0, (max: number) => max * 4.5]} />

            <Tooltip content={<ChartTooltip />} />

            <RBar yAxisId="vol" dataKey="volume" fill="var(--surface-2)" isAnimationActive={false} />

            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="none"
              fill="var(--accent)"
              fillOpacity={0.06}
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="var(--accent)"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="ema20"
              stroke="var(--warn)"
              strokeDasharray="7 4"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="ema50"
              stroke="var(--muted)"
              strokeDasharray="2 4"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {plan && (
              <>
                <ReferenceLine
                  yAxisId="price"
                  y={plan.stopLoss}
                  stroke="var(--bear)"
                  strokeDasharray="5 4"
                  label={{ value: 'Stop', fill: 'var(--bear)', fontSize: 12, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  yAxisId="price"
                  y={plan.target1}
                  stroke="var(--bull)"
                  strokeDasharray="5 4"
                  label={{ value: 'T1', fill: 'var(--bull)', fontSize: 12, position: 'insideTopRight' }}
                />
              </>
            )}
            {levels.support[0] && (
              <ReferenceLine
                yAxisId="price"
                y={levels.support[0]}
                stroke="var(--muted)"
                strokeDasharray="2 4"
                strokeOpacity={0.6}
              />
            )}
            {levels.resistance[0] && (
              <ReferenceLine
                yAxisId="price"
                y={levels.resistance[0]}
                stroke="var(--muted)"
                strokeDasharray="2 4"
                strokeOpacity={0.6}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap gap-4 px-4 text-xs text-[var(--muted)]">
          <Legend color="var(--accent)" label="Close" />
          <Legend color="var(--warn)" label="EMA 20" dash="7 4" />
          <Legend color="var(--muted)" label="EMA 50" dash="2 4" />
          <Legend color="var(--surface-2)" label="Volume" />
        </div>
        <p className="mt-3 px-4 text-xs leading-relaxed text-[var(--muted)]">{data.length} daily observations · {data[0]?.date} to {data.at(-1)?.date}. Closing prices ranged from {inr(lo)} to {inr(hi)}. Latest close {inr(data.at(-1)?.close ?? 0)}. Yahoo data may be delayed; the last daily bar may represent an unfinished session.</p>
        </>}
      </div>
      {data.length > 0 && <details className="border-t border-[var(--border)]" onToggle={(event) => setTableOpen(event.currentTarget.open)}>
        <summary className="min-h-12 cursor-pointer px-5 py-3 text-sm text-[var(--muted)]">View chart data as a table</summary>
        {tableOpen && <div className="max-h-80 overflow-auto px-5 pb-4" tabIndex={0} role="region" aria-label="Daily price observations">
          <table className="w-full min-w-[480px] text-right text-sm">
            <caption className="py-2 text-left text-xs text-[var(--muted)]">Daily close and volume from the provider; EMAs computed on the full history before this range is selected.</caption>
            <thead><tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]"><th scope="col" className="py-3 text-left">Date</th><th scope="col" className="px-2 py-3">Close</th><th scope="col" className="px-2 py-3">EMA 20</th><th scope="col" className="px-2 py-3">EMA 50</th><th scope="col" className="py-3">Volume</th></tr></thead>
            <tbody>{data.map((row) => <tr key={row.date} className="border-b border-[var(--border)]"><th scope="row" className="tnum py-3 text-left font-normal">{row.date}</th><td className="tnum px-2 py-3">{inr(row.close)}</td><td className="tnum px-2 py-3">{inr(row.ema20)}</td><td className="tnum px-2 py-3">{inr(row.ema50)}</td><td className="tnum py-3">{row.volume.toLocaleString('en-IN')}</td></tr>)}</tbody>
          </table>
        </div>}
      </details>}
    </section>
  );
}

function Legend({ color, label, dash }: { color: string; label: string; dash?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="8" aria-hidden="true"><path d="M0 4H20" stroke={color} strokeWidth="2" strokeDasharray={dash} /></svg>
      {label}
    </span>
  );
}

interface TooltipRow {
  date: string;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TooltipRow }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">
        {new Date(d.date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </p>
      <Row label="Close" value={inr(d.close)} />
      {d.ema20 != null && <Row label="EMA 20" value={inr(d.ema20)} color="var(--warn)" />}
      {d.ema50 != null && <Row label="EMA 50" value={inr(d.ema50)} color="var(--muted)" />}
      <Row label="Volume" value={compactVolume(d.volume)} />
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span style={{ color: color ?? 'var(--muted)' }}>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
