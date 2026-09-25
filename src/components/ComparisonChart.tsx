import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import type { ComparePoint, ComparisonSeries } from '../lib/chart';
import { KIND_COLOR, type TimelineEvent } from '../lib/events';
import { compact, formatMultiplier, formatTRY } from '../lib/format';

type Mode = 'erosion' | 'nominal';

interface Props {
  comparison: ComparisonSeries;
  events: TimelineEvent[];
  amount: number;
}

function Tip({
  active,
  payload,
  keys,
  mode,
  amount,
}: {
  active?: boolean;
  payload?: { payload: ComparePoint }[];
  keys: ComparisonSeries['keys'];
  mode: Mode;
  amount: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  const read = (id: string) => {
    const v = p[mode === 'nominal' ? `${id}_nominal` : id];
    return typeof v === 'number' ? v : null;
  };

  const values = keys.map((k) => ({ ...k, value: read(k.id) }));
  const [a, b] = values.map((v) => v.value);
  const gap = a != null && b != null && a !== 0 ? (mode === 'nominal' ? b / a : a / b) : null;

  return (
    <div className="rounded-xl border border-ink-600/70 bg-ink-900/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      <div className="font-mono text-xs font-medium text-ink-200">{p.label}</div>
      <div className="mt-1.5 space-y-1">
        {values.map((v) => (
          <div key={v.id} className="flex items-baseline justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5 text-ink-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.accent }} />
              {v.label}
            </span>
            <span className="font-mono tabular text-ink-100">
              {v.value == null ? '—' : `${formatTRY(v.value)} ₺`}
            </span>
          </div>
        ))}
      </div>
      {gap != null && (
        <div className="mt-2 border-t border-ink-700/60 pt-1.5 text-[11px] text-ink-500">
          Aradaki fark{' '}
          <span className="font-mono tabular text-ink-300">{formatMultiplier(gap)}</span>
        </div>
      )}
      <div className="mt-1 font-mono text-[10px] text-ink-600">başlangıç {formatTRY(amount)} ₺</div>
    </div>
  );
}

export function ComparisonChart({ comparison, events, amount }: Props) {
  const [mode, setMode] = useState<Mode>('erosion');
  const { points, keys, from, to, clipped } = comparison;

  if (!points.length || keys.length < 2) {
    return (
      <div className="panel rounded-3xl px-6 py-12 text-center">
        <p className="text-sm text-ink-400">
          Karşılaştırma için iki kaynağın da kapsadığı bir dönem seçin.
        </p>
      </div>
    );
  }

  const last = points.at(-1)!;
  const finals = keys.map((k) => {
    const v = last[mode === 'nominal' ? `${k.id}_nominal` : k.id];
    return { ...k, value: typeof v === 'number' ? v : null };
  });
  const [first, second] = finals.map((f) => f.value);
  const spread =
    first != null && second != null && second !== 0
      ? mode === 'nominal'
        ? second / first
        : first / second
      : null;

  return (
    <div className="panel rounded-3xl p-4 pt-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div role="tablist" aria-label="Karşılaştırma görünümü" className="flex gap-1 rounded-full border border-ink-700/60 bg-ink-950/50 p-1">
          {([
            { id: 'erosion' as const, label: 'Kalan değer' },
            { id: 'nominal' as const, label: 'Gereken tutar' },
          ]).map((m) => (
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
                  layoutId="compare-tab"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  className="absolute inset-0 rounded-full bg-ink-200"
                />
              )}
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {keys.map((k) => (
            <span key={k.id} className="flex items-center gap-1.5 text-ink-400">
              <span className="h-0.5 w-4 rounded" style={{ background: k.accent }} />
              {k.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 h-[300px] w-full sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              {keys.map((k) => (
                <linearGradient key={k.id} id={`cmp-${k.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={k.accent} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="var(--color-ink-800)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[from, to]}
              stroke="var(--color-ink-600)"
              fontSize={11}
              fontFamily="var(--font-mono)"
              tickLine={false}
              tickFormatter={(v: number) => String(Math.round(v))}
            />
            <YAxis
              stroke="var(--color-ink-600)"
              fontSize={11}
              fontFamily="var(--font-mono)"
              tickLine={false}
              width={58}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-400)', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={<Tip keys={keys} mode={mode} amount={amount} />}
            />
            {events.map((e) => {
              const year = Number(e.month.slice(0, 4));
              if (year < from || year > to) return null;
              return (
                <ReferenceLine
                  key={e.month}
                  x={year + (Number(e.month.slice(5, 7)) - 1) / 12}
                  stroke={KIND_COLOR[e.kind]}
                  strokeOpacity={0.35}
                  strokeDasharray="3 5"
                />
              );
            })}
            {keys.map((k) => (
              <Area
                key={k.id}
                type="monotone"
                dataKey={mode === 'nominal' ? `${k.id}_nominal` : k.id}
                name={k.label}
                stroke={k.accent}
                strokeWidth={2.5}
                fill={`url(#cmp-${k.id})`}
                animationDuration={750}
                dot={{ r: 3, fill: k.accent, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: k.accent, stroke: 'var(--color-ink-950)', strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {spread != null && (
        <div className="mt-4 rounded-2xl border border-ink-700/60 bg-ink-950/40 px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-200">
            {to} sonunda{' '}
            {mode === 'erosion' ? (
              <>
                aynı {formatTRY(amount)} ₺'den geriye TÜİK ölçümüyle{' '}
                <span className="font-mono tabular text-gold-400">{formatTRY(first ?? 0)} ₺</span>,
                ENAG ölçümüyle{' '}
                <span className="font-mono tabular text-ember-400">{formatTRY(second ?? 0)} ₺</span>{' '}
                kalıyor.
              </>
            ) : (
              <>
                aynı alım gücü için TÜİK ölçümüyle{' '}
                <span className="font-mono tabular text-gold-400">{formatTRY(first ?? 0)} ₺</span>,
                ENAG ölçümüyle{' '}
                <span className="font-mono tabular text-ember-400">{formatTRY(second ?? 0)} ₺</span>{' '}
                gerekiyor.
              </>
            )}{' '}
            Aradaki fark <span className="font-mono tabular text-ink-100">{formatMultiplier(spread)}</span>.
          </p>
        </div>
      )}

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-500">
        İki seri de aralık-aralık esasına getirilerek çizilir; aksi hâlde görünen farkın bir kısmı
        ölçümden değil yöntemden gelirdi.
        {clipped && ` Gösterilen dönem, iki kaynağın da kapsadığı ${from}–${to} aralığıdır.`}
      </p>
    </div>
  );
}
