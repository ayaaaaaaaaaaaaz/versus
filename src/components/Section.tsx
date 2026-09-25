import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  id?: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function Section({ id, eyebrow, title, description, children, action }: Props) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="mt-16 sm:mt-24"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500">{eyebrow}</div>
          <h2 className="mt-2 font-display text-3xl leading-tight text-ink-100 sm:text-4xl">{title}</h2>
          {description && <p className="mt-3 text-sm leading-relaxed text-ink-400 sm:text-base">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-7">{children}</div>
    </motion.section>
  );
}
