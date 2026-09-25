import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'ember' | 'gold' | 'mint';
  delay?: number;
}

const TONES: Record<NonNullable<Props['tone']>, string> = {
  neutral: 'text-ink-100',
  ember: 'text-ember-400',
  gold: 'text-gold-400',
  mint: 'text-mint-400',
};

export function Stat({ label, value, hint, tone = 'neutral', delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className="panel rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4"
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular sm:text-2xl ${TONES[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-ink-500">{hint}</div>}
    </motion.div>
  );
}
