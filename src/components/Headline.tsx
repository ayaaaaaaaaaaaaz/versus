import { motion } from 'framer-motion';
import { AnimatedNumber } from './AnimatedNumber';
import { formatMultiplier, formatTRY } from '../lib/format';

interface Props {
  amount: number;
  adjusted: number;
  fromYear: number;
  toYear: number;
  multiplierValue: number;
  surviving: number;
  /** Set when the amount was typed in pre-2005 lira, so we can show both. */
  oldLiraOriginal?: number;
  sourceLabel: string;
  sourceAccent: string;
}

export function Headline({
  amount,
  adjusted,
  fromYear,
  toYear,
  multiplierValue,
  surviving,
  oldLiraOriginal,
  sourceLabel,
  sourceAccent,
}: Props) {
  return (
    <div className="panel relative overflow-hidden rounded-3xl p-6 sm:p-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(40rem_12rem_at_50%_50%,rgb(240_180_41/0.18),transparent_70%)]"
      />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
            {fromYear} yılında
          </div>
          {oldLiraOriginal != null ? (
            <>
              <div className="mt-2 font-mono text-3xl font-medium tabular text-ink-300 sm:text-4xl">
                {formatTRY(oldLiraOriginal)} <span className="text-ink-500">TL</span>
              </div>
              <div className="mt-1.5 font-mono text-xs tabular text-ink-500">
                = {formatTRY(amount)} ₺ yeni lira
              </div>
            </>
          ) : (
            <div className="mt-2 font-mono text-3xl font-medium tabular text-ink-300 sm:text-4xl">
              {formatTRY(amount)} <span className="text-ink-500">₺</span>
            </div>
          )}
        </div>

        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="hidden shrink-0 flex-col items-center gap-1 lg:flex"
        >
          <div className="font-mono text-xs tabular text-gold-500">{formatMultiplier(multiplierValue)}</div>
          <svg width="88" height="14" viewBox="0 0 88 14" fill="none" className="text-ink-600">
            <path d="M0 7h78" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
            <path d="M78 2l7 5-7 5" stroke="var(--color-gold-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500">
              {toYear} parasıyla
            </span>
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px] text-ink-950"
              style={{ background: sourceAccent }}
              title="Bu rakamın dayandığı enflasyon serisi"
            >
              {sourceLabel}
            </span>
          </div>
          <div className="mt-2 font-display text-5xl leading-none text-ink-100 sm:text-6xl lg:text-7xl">
            <AnimatedNumber value={adjusted} format={formatTRY} className="shimmer-text tabular" />
            <span className="ml-2 align-top font-sans text-2xl text-gold-500 sm:text-3xl">₺</span>
          </div>
        </div>
      </div>

      <div className="relative mt-8 border-t border-ink-700/50 pt-5">
        <p className="text-sm leading-relaxed text-ink-300 sm:text-base">
          Tersinden bakarsak:{' '}
          <span className="font-mono tabular text-ember-400">{formatTRY(amount)} ₺</span>, {fromYear} yılındaki
          alım gücünün yalnızca{' '}
          <span className="font-mono tabular text-ember-400">
            <AnimatedNumber value={amount * surviving} format={formatTRY} /> ₺
          </span>{' '}
          kadarını {toYear} yılına taşıyabildi.
        </p>
      </div>
    </div>
  );
}
