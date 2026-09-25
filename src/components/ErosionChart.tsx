import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ChartPoint, ChartSeries } from '../lib/chart';
import { decimalYear } from '../lib/chart';
import { KIND_COLOR, KIND_LABEL, type TimelineEvent } from '../lib/events';
import { compact, formatPct, formatTRY } from '../lib/format';

type Mode = 'erosion' | 'nominal' | 'hard' | 'rates';

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'erosion', label: 'Erime', blurb: 'Başlangıç tutarının reel olarak geriye kalanı.' },
  { id: 'nominal', label: 'Nominal', blurb: 'Aynı alım gücü için her dönem gereken lira.' },
  { id: 'hard', label: 'Döviz', blurb: 'Aynı tutarın dolar ve euro karşılığı.' },
  { id: 'rates', label: 'Enflasyon', blurb: 'Yıllık TÜFE değişimi.' },
];

interface Props {
  series: ChartSeries;
  events: TimelineEvent[];
  amount: number;
  fromYear: number;
  toYear: number;
}

const axis = {
  stroke: 'var(--color-ink-600)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  tickLine: false,
} as const;

function Tip({
  active,
  payload,
  mode,
  amount,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  mode: Mode;
  amount: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  const rows: [string, string][] =
    mode === 'rates'
      ? [['TÜFE (yıllık)', p.inflation == null ? '—' : formatPct(p.inflation)]]
      : mode === 'hard'
        ? [
            ['Dolar', p.usd == null ? '—' : '$' + formatTRY(p.usd)],
            ['Euro', p.eur == null ? '—' : '€' + formatTRY(p.eur)],
          ]
        : mode === 'nominal'
          ? [
              ['Gereken tutar', formatTRY(p.nominal) + ' ₺'],
              ['Başlangıç', formatTRY(amount) + ' ₺'],
            ]
          : [
              ['Kalan reel değer', formatTRY(p.real) + ' ₺'],
              ['Başlangıcın yüzdesi', formatPct(p.realPct)],
            ];

  return (
    <div className="rounded-xl border border-ink-600/70 bg-ink-900/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      <div className="font-mono text-xs font-medium text-gold-400">{p.label}</div>
      <div className="mt-1.5 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-5 text-xs">
            <span className="text-ink-400">{k}</span>
            <span className="font-mono tabular text-ink-100">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErosionChart({ series, events, amount, fromYear, toYear }: Props) {
  const [mode, setMode] = useState<Mode>('erosion');
  const [showEvents, setShowEvents] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  const { points, isMonthly } = series;
  const nominalNeedsLog =
    points.length > 1 && points[0].nominal > 0 && points.at(-1)!.nominal / points[0].nominal > 500;

  const blurb = MODES.find((m) => m.id === mode)!.blurb;
  const pinned = showEvents ? events : [];
  const selected = pinned.find((e) => e.month === active) ?? null;

  const domain: [number, number] = [fromYear, toYear + (isMonthly ? 1 : 0)];

  return (
    <div className="panel rounded-3xl p-4 pt-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div role="tablist" aria-label="Grafik görünümü" className="flex flex-wrap gap-1 rounded-full border border-ink-700/60 bg-ink-950/50 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                mode === m.id ? 'text-ink-950' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {mode === m.id && (
                <motion.span
                  layoutId="chart-tab"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  className="absolute inset-0 rounded-full bg-gold-400"
                />
              )}
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {events.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEvents((v) => !v)}
              aria-pressed={showEvents}
              className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                showEvents
                  ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
                  : 'border-ink-700/70 text-ink-400 hover:text-ink-200'
              }`}
            >
              Olaylar · {events.length}
            </button>
          )}
          <span className="rounded-full border border-ink-700/60 px-2.5 py-1 font-mono text-[10px] text-ink-500">
            {isMonthly ? 'aylık' : 'yıllık'}
          </span>
        </div>
      </div>

      <p className="mt-2 px-1 text-xs text-ink-500">{blurb}</p>

      <div className="mt-4 h-[300px] w-full sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'rates' ? (
            <BarChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-ink-800)" vertical={false} />
              <XAxis dataKey="x" type="number" domain={domain} {...axis} tickFormatter={(v: number) => String(Math.round(v))} />
              <YAxis {...axis} width={52} tickFormatter={(v: number) => `${compact(v)}%`} />
              <Tooltip cursor={{ fill: 'rgb(240 180 41 / 0.07)' }} content={<Tip mode={mode} amount={amount} />} />
              <ReferenceLine y={0} stroke="var(--color-ink-600)" />
              <Bar dataKey="inflation" radius={[2, 2, 0, 0]}>
                {points.map((d) => (
                  <Cell
                    key={d.x}
                    fill={
                      (d.inflation ?? 0) > 50
                        ? 'var(--color-ember-500)'
                        : (d.inflation ?? 0) > 20
                          ? 'var(--color-gold-600)'
                          : 'var(--color-gold-400)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="fillErosion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-gold-400)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--color-ember-600)" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="fillNominal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-ember-500)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-ember-600)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillHard" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-mint-400)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-mint-500)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-ink-800)" vertical={false} />
              <XAxis dataKey="x" type="number" domain={domain} {...axis} tickFormatter={(v: number) => String(Math.round(v))} />
              <YAxis
                {...axis}
                width={58}
                scale={mode === 'nominal' && nominalNeedsLog ? 'log' : 'auto'}
                domain={mode === 'nominal' && nominalNeedsLog ? ['auto', 'auto'] : [0, 'auto']}
                tickFormatter={(v: number) => compact(v)}
              />
              <Tooltip
                cursor={{ stroke: 'var(--color-gold-500)', strokeWidth: 1, strokeDasharray: '4 4' }}
                content={<Tip mode={mode} amount={amount} />}
              />

              {pinned.map((e) => {
                const x = decimalYear(e.month);
                if (x < domain[0] || x > domain[1]) return null;
                const isActive = active === e.month;
                return (
                  <ReferenceLine
                    key={e.month}
                    x={x}
                    stroke={KIND_COLOR[e.kind]}
                    strokeOpacity={isActive ? 0.95 : 0.4}
                    strokeWidth={isActive ? 2 : 1}
                    strokeDasharray={isActive ? undefined : '3 5'}
                  />
                );
              })}

              {mode === 'erosion' && (
                <>
                  <ReferenceLine y={amount / 2} stroke="var(--color-ink-600)" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="real"
                    stroke="var(--color-gold-400)"
                    strokeWidth={2.5}
                    fill="url(#fillErosion)"
                    animationDuration={700}
                    dot={false}
                    activeDot={{ r: 5, fill: 'var(--color-gold-300)', stroke: 'var(--color-ink-950)', strokeWidth: 2 }}
                  />
                </>
              )}
              {mode === 'nominal' && (
                <Area
                  type="monotone"
                  dataKey="nominal"
                  stroke="var(--color-ember-400)"
                  strokeWidth={2.5}
                  fill="url(#fillNominal)"
                  animationDuration={700}
                  dot={false}
                  activeDot={{ r: 5, fill: 'var(--color-ember-400)', stroke: 'var(--color-ink-950)', strokeWidth: 2 }}
                />
              )}
              {mode === 'hard' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="usd"
                    stroke="var(--color-mint-400)"
                    strokeWidth={2.5}
                    fill="url(#fillHard)"
                    animationDuration={700}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 5, fill: 'var(--color-mint-400)', stroke: 'var(--color-ink-950)', strokeWidth: 2 }}
                  />
                  <Line type="monotone" dataKey="eur" stroke="var(--color-ink-300)" strokeWidth={1.75} strokeDasharray="5 4" dot={false} connectNulls animationDuration={700} />
                </>
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {pinned.length > 0 && mode !== 'rates' && (
        <div className="mt-3 border-t border-ink-700/40 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {pinned.map((e) => (
              <button
                key={e.month}
                type="button"
                onMouseEnter={() => setActive(e.month)}
                onFocus={() => setActive(e.month)}
                onMouseLeave={() => setActive((a) => (a === e.month ? null : a))}
                onClick={() => setActive((a) => (a === e.month ? null : e.month))}
                aria-pressed={active === e.month}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  active === e.month
                    ? 'border-transparent text-ink-950'
                    : 'border-ink-700/70 text-ink-400 hover:text-ink-200'
                }`}
                style={active === e.month ? { background: KIND_COLOR[e.kind] } : undefined}
              >
                <span className="font-mono opacity-70">{e.month.slice(0, 4)}</span> {e.title}
              </button>
            ))}
          </div>

          <motion.div
            initial={false}
            animate={{ height: selected ? 'auto' : 0, opacity: selected ? 1 : 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {selected && (
              <div className="mt-3 rounded-xl border border-ink-700/60 bg-ink-950/50 p-3.5">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-ink-950"
                    style={{ background: KIND_COLOR[selected.kind] }}
                  >
                    {KIND_LABEL[selected.kind]}
                  </span>
                  <span className="font-mono text-[11px] text-ink-500">{selected.month}</span>
                </div>
                <h4 className="mt-2 text-sm font-semibold text-ink-100">{selected.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{selected.detail}</p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
