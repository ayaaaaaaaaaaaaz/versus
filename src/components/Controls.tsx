import { AnimatePresence, motion } from 'framer-motion';
import { formatTRY } from '../lib/format';
import { REDENOM_FACTOR, REDENOM_YEAR } from '../lib/series';
import { rangePresets } from '../lib/sources';
import { YearSlider } from './YearSlider';

const PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000];

interface Props {
  /** Earliest year the selected source can price. */
  minYear: number;
  /** Latest year the selected source can price. */
  maxYear: number;
  rawAmount: string;
  amount: number;
  fromYear: number;
  toYear: number;
  oldLira: boolean;
  onAmount: (raw: string) => void;
  onFromYear: (y: number) => void;
  onToYear: (y: number) => void;
  onOldLira: (v: boolean) => void;
}

export function Controls({
  minYear,
  maxYear,
  rawAmount,
  amount,
  fromYear,
  toYear,
  oldLira,
  onAmount,
  onFromYear,
  onToYear,
  onOldLira,
}: Props) {
  const showRedenom = fromYear < REDENOM_YEAR;

  const presets = rangePresets(minYear, maxYear);

  return (
    <div className="panel rounded-3xl p-5 sm:p-7">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div>
          <label htmlFor="amount" className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
            Tutar
          </label>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-ink-700/70 bg-ink-950/60 px-4 py-3 transition-colors focus-within:border-gold-500/70">
            <span className="font-display text-3xl leading-none text-gold-500">₺</span>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={rawAmount}
              onChange={(e) => onAmount(e.target.value)}
              placeholder="1.000"
              aria-describedby="amount-help"
              className="w-full bg-transparent font-mono text-2xl font-medium tabular text-ink-100 outline-none placeholder:text-ink-600 sm:text-3xl"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = amount === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onAmount(p.toLocaleString('tr-TR'))}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 font-mono text-xs tabular transition-colors ${
                    active
                      ? 'border-gold-500/70 bg-gold-500/15 text-gold-300'
                      : 'border-ink-700/70 text-ink-400 hover:border-ink-600 hover:text-ink-200'
                  }`}
                >
                  {formatTRY(p)}
                </button>
              );
            })}
          </div>

          <p id="amount-help" className="mt-3 text-xs leading-relaxed text-ink-500">
            {fromYear} yılında elinizde olan tutarı girin.
          </p>

          <AnimatePresence initial={false}>
            {showRedenom && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-gold-300">Eski lira (TL) olarak girdim</div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                        1 Ocak 2005'te altı sıfır atıldı: 1.000.000 TL = 1 YTL. {fromYear} yılından bir tutar
                        yazdıysanız bu muhtemelen eski lira.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={oldLira}
                      aria-label="Eski lira olarak yorumla"
                      onClick={() => onOldLira(!oldLira)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        oldLira ? 'bg-gold-500' : 'bg-ink-700'
                      }`}
                    >
                      <motion.span
                        layout
                        transition={{ type: 'spring', stiffness: 550, damping: 34 }}
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 ${oldLira ? 'left-[22px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>
                  {oldLira && amount > 0 && (
                    <div className="mt-3 border-t border-gold-500/20 pt-3 font-mono text-xs tabular text-gold-300">
                      = {formatTRY(amount / REDENOM_FACTOR)} ₺ (yeni lira)
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col justify-center gap-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <YearSlider
              label="Başlangıç yılı"
              value={fromYear}
              min={minYear}
              max={toYear - 1}
              accent="var(--color-gold-500)"
              onChange={(y) => onFromYear(Math.min(Math.max(y, minYear), toYear - 1))}
            />
            <YearSlider
              label="Bitiş yılı"
              value={toYear}
              min={fromYear + 1}
              max={maxYear}
              accent="var(--color-ember-500)"
              onChange={(y) => onToYear(Math.min(Math.max(y, fromYear + 1), maxYear))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((r) => {
              const active = fromYear === r.from && toYear === maxYear;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => {
                    onFromYear(r.from);
                    onToYear(maxYear);
                  }}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? 'border-ember-500/60 bg-ember-500/15 text-ember-400'
                      : 'border-ink-700/70 text-ink-400 hover:border-ink-600 hover:text-ink-200'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <p className="font-mono text-[11px] text-ink-600">
            seçilebilir aralık {minYear}–{maxYear}
          </p>
        </div>
      </div>
    </div>
  );
}
