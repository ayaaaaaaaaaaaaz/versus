import { motion } from 'framer-motion';
import { formatTRY } from '../lib/format';
import { eurRate, usdRate } from '../lib/series';

interface Props {
  amount: number;
  adjusted: number;
  fromYear: number;
  toYear: number;
  /** TCMB's daily bulletin, when the Pages Function is reachable. */
  today?: { usd: number | null; eur: number | null; asOf: string | null } | null;
}

interface Row {
  code: string;
  symbol: string;
  then: number | null;
  now: number | null;
}

export function HardCurrency({ amount, adjusted, fromYear, toYear, today }: Props) {
  const build = (rate: (y: number) => number | null, code: string, symbol: string): Row => {
    const a = rate(fromYear);
    const b = rate(toYear);
    return {
      code,
      symbol,
      then: a ? amount / a : null,
      now: b ? adjusted / b : null,
    };
  };

  const rows = [build(usdRate, 'Dolar', '$'), build(eurRate, 'Euro', '€')].filter((r) => r.then != null);
  if (!rows.length) return null;

  return (
    <div className="panel rounded-2xl px-5 py-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
        Sert para karşılığı
      </div>
      <div className="mt-3 space-y-3">
        {rows.map((r, i) => {
          const ratio = r.then && r.now ? r.now / r.then : null;
          const kept = ratio != null && ratio >= 0.995;
          return (
            <motion.div
              key={r.code}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * i }}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-ink-400">{r.code}</span>
              <span className="flex items-baseline gap-2 font-mono text-xs tabular">
                <span className="text-ink-300">
                  {r.symbol}
                  {formatTRY(r.then!)}
                </span>
                <span className="text-ink-600">→</span>
                <span className={kept ? 'text-mint-400' : 'text-ember-400'}>
                  {r.now == null ? '—' : r.symbol + formatTRY(r.now)}
                </span>
              </span>
            </motion.div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-ink-700/40 pt-2.5 text-[11px] leading-relaxed text-ink-500">
        Soldaki, {fromYear} ortalama kuruyla orijinal tutar. Sağdaki, {toYear} ortalama kuruyla
        enflasyona göre düzeltilmiş tutar. İkisi eşitse lira, o para birimine karşı reel olarak
        değerini korumuş demektir.
      </p>

      {today?.usd && (
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-ink-700/40 pt-2.5 font-mono text-[11px] tabular text-ink-500">
          <span className="text-mint-400">TCMB {today.asOf}</span>
          <span>1 $ = {formatTRY(today.usd)} ₺</span>
          {today.eur && <span>· 1 € = {formatTRY(today.eur)} ₺</span>}
        </p>
      )}
    </div>
  );
}
