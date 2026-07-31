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
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const pad = (hi - lo) * 0.12 || 1;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">Price action</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Close with 20 &amp; 50-day EMAs. Dashed lines mark the trade plan.
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                range === r.days
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-2 py-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 56, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
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
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
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
              fill="url(#priceFill)"
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
              stroke="#eab308"
              strokeWidth={1.2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="ema50"
              stroke="#a855f7"
              strokeWidth={1.2}
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
                  label={{ value: 'Stop', fill: 'var(--bear)', fontSize: 10, position: 'right' }}
                />
                <ReferenceLine
                  yAxisId="price"
                  y={plan.target1}
                  stroke="var(--bull)"
                  strokeDasharray="5 4"
                  label={{ value: 'T1', fill: 'var(--bull)', fontSize: 10, position: 'right' }}
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
          <Legend color="#eab308" label="EMA 20" />
          <Legend color="#a855f7" label="EMA 50" />
          <Legend color="var(--surface-2)" label="Volume" />
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded" style={{ background: color }} />
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
      {d.ema20 != null && <Row label="EMA 20" value={inr(d.ema20)} color="#eab308" />}
      {d.ema50 != null && <Row label="EMA 50" value={inr(d.ema50)} color="#a855f7" />}
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
