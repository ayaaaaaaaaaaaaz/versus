import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSource, type ViewMode } from '../context/source';
import { SOURCE_LIST } from '../lib/sources';

const OPTIONS: { id: ViewMode; label: string; accent: string }[] = [
  ...SOURCE_LIST.map((s) => ({ id: s.id as ViewMode, label: s.fullLabel, accent: s.accent })),
  { id: 'compare', label: 'İkisini karşılaştır', accent: 'var(--color-ink-300)' },
];

export function SourceToggle() {
  const { view, setView } = useSource();
  const [explain, setExplain] = useState(false);

  return (
    <div className="panel rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Enflasyon verisi kaynağı
          </div>
          <p className="mt-1 text-xs text-ink-500">
            Seçim, ekrandaki her rakamı ve grafiği değiştirir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExplain((v) => !v)}
          aria-expanded={explain}
          className="rounded-full border border-ink-700/70 px-3 py-1.5 text-[11px] text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-200"
        >
          {explain ? 'Kapat' : 'Bu kaynaklar ne?'}
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Enflasyon verisi kaynağı"
        className="mt-3 flex flex-col gap-1 rounded-2xl border border-ink-700/60 bg-ink-950/50 p-1 sm:flex-row"
      >
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            role="tab"
            aria-selected={view === opt.id}
            onClick={() => setView(opt.id)}
            className={`relative flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              view === opt.id ? 'text-ink-950' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {view === opt.id && (
              <motion.span
                layoutId="source-toggle"
                transition={{ type: 'spring', stiffness: 430, damping: 36 }}
                className="absolute inset-0 rounded-xl"
                style={{ background: opt.accent }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {explain && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {SOURCE_LIST.map((s) => (
                <div key={s.id} className="rounded-2xl border border-ink-700/60 bg-ink-950/40 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.accent }} />
                    <span className="text-xs font-semibold text-ink-100">{s.fullLabel}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-400">{s.description}</p>
                  <dl className="mt-2.5 space-y-1 border-t border-ink-800 pt-2 font-mono text-[10px] text-ink-500">
                    <div className="flex justify-between gap-3">
                      <dt>kapsam</dt>
                      <dd className="text-ink-400">{s.minYear}–{s.maxYear}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>esas</dt>
                      <dd className="text-ink-400">{s.basisLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>güncellenme</dt>
                      <dd className="text-ink-400">{s.lastUpdated}</dd>
                    </div>
                  </dl>
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-block text-[10px] text-ink-500 underline decoration-ink-700 underline-offset-2 transition-colors hover:text-ink-300"
                  >
                    {s.sourceName}
                  </a>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
              Versus bu iki ölçümden hangisinin doğru olduğu konusunda taraf tutmaz. İkisi de
              yöntemlerini açıklar, sonuçları farklıdır; karşılaştırma görünümü farkı doğrudan
              gösterir.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
