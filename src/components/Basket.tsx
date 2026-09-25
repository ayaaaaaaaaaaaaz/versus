import { motion } from 'framer-motion';
import type { BasketComparison } from '../lib/basket';
import { formatPct, formatTRY, formatUnits } from '../lib/format';

interface Props {
  rows: BasketComparison[];
  fromYear: number;
  toYear: number;
}

function Bar({ value, max, tone, label }: { value: number; max: number; tone: string; label: string }) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800/80">
        <motion.div
          className={`h-full rounded-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-xs tabular text-ink-200">{formatUnits(value)}</span>
    </div>
  );
}

export function Basket({ rows, fromYear, toYear }: Props) {
  if (!rows.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => {
        const max = Math.max(r.unitsThen, r.unitsNow);
        const lost = !r.isIncome && r.ratio < 0.995;
        const gained = !r.isIncome && r.ratio > 1.005;

        // A price that outruns CPI is bad news; a wage that outruns CPI is good
        // news. Same arithmetic, opposite reading, so income lines show their
        // own real growth instead of the buy-less figure.
        const badge = r.isIncome
          ? `${r.realChange >= 0 ? '+' : ''}${formatPct(r.realChange, 0)}`
          : `${r.ratio - 1 >= 0 ? '+' : ''}${formatPct((r.ratio - 1) * 100, 0)}`;
        const badgeTone = r.isIncome
          ? r.realChange >= 0
            ? 'bg-mint-500/15 text-mint-400'
            : 'bg-ember-600/15 text-ember-400'
          : lost
            ? 'bg-ember-600/15 text-ember-400'
            : gained
              ? 'bg-mint-500/15 text-mint-400'
              : 'bg-ink-700/50 text-ink-300';

        return (
          <motion.article
            key={r.item.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.045, 0.4), ease: [0.16, 1, 0.3, 1] }}
            className="panel flex flex-col rounded-2xl p-4"
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="text-2xl leading-none">
                  {r.item.emoji}
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                    <span className="truncate">{r.item.name}</span>
                    {r.isIncome && (
                      <span className="shrink-0 rounded border border-ink-600/70 px-1 py-px text-[9px] uppercase tracking-wider text-ink-400">
                        gelir
                      </span>
                    )}
                  </h3>
                  <p className="truncate text-[11px] text-ink-500">{r.item.unit}</p>
                </div>
              </div>
              <span
                title={
                  r.isIncome
                    ? `Yılda ortalama ${formatPct(r.itemAnnualPct)} arttı; TÜFE'ye göre reel değişim ${formatPct(r.realChange, 0)}`
                    : `Bu kalem yılda ortalama ${formatPct(r.itemAnnualPct)} zamlandı`
                }
                className={`shrink-0 rounded-full px-2 py-1 font-mono text-[11px] tabular ${badgeTone}`}
              >
                {badge}
              </span>
            </header>

            <div className="mt-4 space-y-2">
              <Bar value={r.unitsThen} max={max} tone="bg-gold-400" label={String(fromYear).slice(2)} />
              <Bar
                value={r.unitsNow}
                max={max}
                tone={r.isIncome ? 'bg-ink-400' : lost ? 'bg-ember-500' : 'bg-mint-400'}
                label={String(toYear).slice(2)}
              />
            </div>

            <footer className="mt-4 flex items-center justify-between border-t border-ink-700/40 pt-3 text-[11px] text-ink-500">
              <span className="font-mono tabular">
                {formatTRY(r.priceThen)} → {formatTRY(r.priceNow)} ₺
              </span>
              {r.estimated && (
                <span title="Bu yıl için fiyat, en yakın referans yıldan TÜFE ile türetildi" className="text-ink-600">
                  tahmini
                </span>
              )}
            </footer>
          </motion.article>
        );
      })}
    </div>
  );
}
