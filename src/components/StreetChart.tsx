import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  buildDailyIndex,
  buildTuikBasketIndex,
  officialFoodIndex,
  readiness,
  rebase,
  toMonthly,
  type MonthlyPoint,
} from '../lib/street-index';
import { compact, formatMultiplier, formatPct } from '../lib/format';

interface Row {
  x: number;
  month: string;
  basket: number | null;
  official: number | null;
  gap: number | null;
  street: number | null;
}

const monthToX = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return y + (m - 1) / 12;
};

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const label = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${TR_MONTHS[m - 1]} ${y}`;
};

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const rows: [string, string, string][] = [
    ['Sepetimiz (TÜİK fiyatlarıyla)', p.basket == null ? '—' : compact(p.basket), 'text-gold-400'],
    ['Resmî gıda endeksi', p.official == null ? '—' : compact(p.official), 'text-ink-300'],
  ];
  if (p.street != null) rows.push(['Sokak endeksi', compact(p.street), 'text-mint-400']);

  return (
    <div className="rounded-xl border border-ink-600/70 bg-ink-900/95 px-3.5 py-2.5 shadow-2xl backdrop-blur">
      <div className="font-mono text-xs font-medium text-ink-200">{label(p.month)}</div>
      <div className="mt-1.5 space-y-1">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-5 text-xs">
            <span className="text-ink-400">{k}</span>
            <span className={`font-mono tabular ${tone}`}>{v}</span>
          </div>
        ))}
      </div>
      {p.gap != null && (
        <div className="mt-2 border-t border-ink-700/60 pt-1.5 text-[11px] text-ink-500">
          Aradaki fark <span className="font-mono tabular text-ink-300">{formatPct(p.gap, 1)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Built once at module load rather than inside the component.
 *
 * Every input is bundled JSON, so the result can never change between renders
 * and a hook would only be ceremony around a constant.
 */
const CHART = (() => {
  {
    const collected = readiness();
    const basketRaw = buildTuikBasketIndex();
    if (!basketRaw.length) {
      return { rows: [] as Row[], anchor: null, spread: null, state: collected };
    }

    const anchorMonth = basketRaw[0].month;
    const basket = rebase(basketRaw, anchorMonth);
    const official = rebase(officialFoodIndex(), anchorMonth);

    // Our own collected index, if there is enough of it to plot.
    const street: MonthlyPoint[] = collected.meaningful
      ? rebase(toMonthly(buildDailyIndex().points), anchorMonth)
      : [];

    const officialBy = new Map(official.map((p) => [p.month, p.value]));
    const streetBy = new Map(street.map((p) => [p.month, p.value]));

    const out: Row[] = basket.map((p) => {
      const off = officialBy.get(p.month) ?? null;
      return {
        x: monthToX(p.month),
        month: p.month,
        basket: p.value,
        official: off,
        gap: off != null && off !== 0 ? (p.value / off - 1) * 100 : null,
        street: streetBy.get(p.month) ?? null,
      };
    });

    const last = [...out].reverse().find((r) => r.official != null && r.basket != null);
    return {
      rows: out,
      anchor: anchorMonth,
      spread: last ? last.basket! / last.official! : null,
      state: collected,
    };
  }
})();

export function StreetChart() {
  const [showGap, setShowGap] = useState(true);
  const { rows, anchor, spread, state } = CHART;

  if (!rows.length) {
    return (
      <div className="panel rounded-3xl px-6 py-12 text-center">
        <p className="text-sm text-ink-400">Henüz çizilecek veri yok.</p>
      </div>
    );
  }

  const startX = state.firstDay ? monthToX(state.firstDay.slice(0, 7)) : null;

  return (
    <div className="panel rounded-3xl p-4 pt-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-0.5 w-4 rounded bg-gold-400" /> Sepetimiz
          </span>
          <span className="flex items-center gap-1.5 text-ink-400">
            <span className="h-0.5 w-4 rounded bg-ink-300" /> Resmî gıda endeksi
          </span>
          {state.meaningful && (
            <span className="flex items-center gap-1.5 text-ink-400">
              <span className="h-0.5 w-4 rounded bg-mint-400" /> Sokak endeksi
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowGap((v) => !v)}
          aria-pressed={showGap}
          className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
            showGap
              ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
              : 'border-ink-700/70 text-ink-400 hover:text-ink-200'
          }`}
        >
          Farkı göster
        </button>
      </div>

      <div className="mt-5 h-[300px] w-full sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="streetGap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-gold-400)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--color-gold-600)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-ink-800)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
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
              width={56}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-400)', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={<Tip />}
            />
            {showGap && (
              <Area
                type="monotone"
                dataKey="basket"
                stroke="none"
                fill="url(#streetGap)"
                animationDuration={700}
                isAnimationActive
              />
            )}
            <Line
              type="monotone"
              dataKey="official"
              stroke="var(--color-ink-300)"
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              animationDuration={700}
            />
            <Line
              type="monotone"
              dataKey="basket"
              stroke="var(--color-gold-400)"
              strokeWidth={2.5}
              dot={false}
              animationDuration={700}
            />
            {state.meaningful && (
              <Line
                type="monotone"
                dataKey="street"
                stroke="var(--color-mint-400)"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                animationDuration={700}
              />
            )}
            {startX != null && (
              <ReferenceLine
                x={startX}
                stroke="var(--color-mint-400)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: 'kendi ölçümümüz başlıyor',
                  position: 'insideTopLeft',
                  fill: 'var(--color-mint-400)',
                  fontSize: 10,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {spread != null && anchor && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-4 rounded-2xl border border-ink-700/60 bg-ink-950/40 px-4 py-3"
        >
          <p className="text-sm leading-relaxed text-ink-200">
            {label(anchor)} = 100 kabul edildiğinde, 25 kalemlik bu sepet resmî gıda endeksinden{' '}
            <span className="font-mono tabular text-gold-400">{formatMultiplier(spread)}</span> daha
            hızlı pahalılaştı. İki seri de TÜİK verisine dayanır; fark, dar bir temel gıda
            sepetiyle tüm gıda harcamasının ortalaması arasındaki farktır.
          </p>
        </motion.div>
      )}
    </div>
  );
}
