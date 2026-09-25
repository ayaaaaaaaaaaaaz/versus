import { motion } from 'framer-motion';
import { compareAssets, assetMeta } from '../lib/assets';
import { formatPct, formatTRY, formatUnits } from '../lib/format';

interface Props {
  amount: number;
  fromYear: number;
  toYear: number;
  /** Price relative from the selected source, so real returns follow it. */
  cpiOverride?: number;
}

export function AssetRace({ amount, fromYear, toYear, cpiOverride }: Props) {
  const rows = compareAssets(amount, fromYear, toYear, cpiOverride);
  if (!rows.length) return null;

  // Scale bars against the best performer so the spread stays readable even
  // when one asset dwarfs the rest.
  const best = Math.max(...rows.map((r) => r.realRatio), 1);

  return (
    <div className="panel rounded-3xl p-5 sm:p-6">
      <div className="space-y-4">
        {rows.map((r, i) => {
          const beat = r.realRatio > 1.005;
          const lost = r.realRatio < 0.995;
          const width = Math.max(1.5, (r.realRatio / best) * 100);

          return (
            <motion.div
              key={r.asset.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-medium text-ink-100">
                  <span aria-hidden="true">{r.asset.emoji}</span>
                  {r.asset.label}
                  <span className="font-mono text-[11px] tabular text-ink-600" title={`${fromYear} yılında alınan miktar`}>
                    {formatUnits(r.units)} {r.asset.unit}
                  </span>
                </span>
                <span className="flex items-baseline gap-2.5 font-mono text-xs tabular">
                  <span className="text-ink-500" title="Bugünkü nominal karşılığı">
                    {formatTRY(r.nominal)} ₺
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      beat ? 'bg-mint-500/15 text-mint-400' : lost ? 'bg-ember-600/15 text-ember-400' : 'bg-ink-700/50 text-ink-300'
                    }`}
                    title="Enflasyondan arındırılmış reel değişim"
                  >
                    {r.realPct >= 0 ? '+' : ''}
                    {formatPct(r.realPct, 0)}
                  </span>
                </span>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-ink-800/80">
                  {/* The break-even marker: where the bar must reach to have merely kept up. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 z-10 w-px bg-ink-400/70"
                    style={{ left: `${(1 / best) * 100}%` }}
                  />
                  <motion.div
                    className={`h-full rounded-full ${beat ? 'bg-mint-400' : lost ? 'bg-ember-500' : 'bg-ink-500'}`}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${width}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.75, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-sm tabular text-ink-200">
                  {r.realRatio.toFixed(2)}x
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-700/40 pt-3.5 text-[11px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink-400/70" /> enflasyonu başabaş karşılayan çizgi
        </span>
        <span>· çarpan, {fromYear} lirası cinsinden reel değer</span>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-500">{assetMeta.caveat} {assetMeta.derived}</p>
    </div>
  );
}
