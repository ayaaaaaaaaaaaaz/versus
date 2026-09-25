import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AnimatedNumber } from './AnimatedNumber';
import { PRESETS, computePersonal } from '../lib/personal';
import { categories, categoryMeta } from '../lib/monthly';
import {
  ENAG_MAX_YEAR,
  ENAG_MIN_YEAR,
  enagCovers,
  enagMultiplier,
  enagRatio,
  officialYearEndMultiplier,
} from '../lib/enag';
import { useSource } from '../context/source';
import { formatMultiplier, formatPct } from '../lib/format';

const STORAGE_KEY = 'versus.basket.v1';

const officialWeights = () => Object.fromEntries(categories.map((c) => [c.code, c.weight]));

function loadStored(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    // Only accept a shape that still matches the current category list.
    if (categories.every((c) => typeof parsed[c.code] === 'number')) return parsed;
  } catch {
    // Private mode, blocked storage, or stale shape — fall through to defaults.
  }
  return null;
}

/**
 * Which preset, if any, a set of weights corresponds to. Restored weights come
 * back from storage without any record of how they were produced, so the chip
 * highlight has to be re-derived or it will contradict the sliders.
 */
function matchPreset(weights: Record<string, number>): string | null {
  for (const preset of PRESETS) {
    const same = categories.every(
      (c) => Math.abs((weights[c.code] ?? 0) - (preset.weights[c.code] ?? 0)) < 0.01,
    );
    if (same) return preset.id;
  }
  return null;
}

interface Props {
  fromYear: number;
  toYear: number;
}

export function PersonalBasket({ fromYear, toYear }: Props) {
  const [weights, setWeights] = useState<Record<string, number>>(() => loadStored() ?? officialWeights());
  const [activePreset, setActivePreset] = useState<string | null>(() =>
    matchPreset(loadStored() ?? officialWeights()),
  );
  // The source is chosen once, app-wide; this panel follows it rather than
  // carrying a second control that could disagree with the rest of the page.
  const { source } = useSource();

  /**
   * ENAGrup only published from 2020 and the archive only yields complete years
   * through 2024, so the selected span rarely sits inside their coverage. Rather
   * than disable the option whenever it does not, the comparison runs over the
   * overlapping years and the UI states which ones it used.
   */
  const enagFrom = Math.max(fromYear, ENAG_MIN_YEAR);
  const enagTo = Math.min(toYear, ENAG_MAX_YEAR);
  const enagAvailable = enagCovers(enagFrom, enagTo);
  const useEnag = source.id === 'enag' && enagAvailable;
  const clipped = useEnag && (enagFrom !== fromYear || enagTo !== toYear);

  // In ENAG mode every figure is computed over the overlap, so the level, the
  // tilt and the official comparison all describe the same years.
  const spanFrom = useEnag ? enagFrom : fromYear;
  const spanTo = useEnag ? enagTo : toYear;

  const enagLevel = useEnag ? enagMultiplier(enagFrom, enagTo) : null;
  const officialYearEnd = useEnag ? officialYearEndMultiplier(enagFrom, enagTo) : null;
  const ratio = useEnag ? enagRatio(enagFrom, enagTo) : null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
    } catch {
      // Persisting is a convenience; the page works without it.
    }
  }, [weights]);

  const result = useMemo(
    () => computePersonal(weights, spanFrom, spanTo, { levelMultiplier: enagLevel ?? undefined }),
    [weights, spanFrom, spanTo, enagLevel],
  );

  const rawTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const share = (code: string) => (rawTotal > 0 ? ((weights[code] ?? 0) / rawTotal) * 100 : 0);

  const setOne = (code: string, value: number) => {
    setActivePreset(null);
    setWeights((w) => ({ ...w, [code]: value }));
  };

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setActivePreset(id);
    setWeights({ ...preset.weights });
  };

  const higher = result.gapRatio > 1.002;
  const lower = result.gapRatio < 0.998;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="panel rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-100">Harcamanızı dağıtın</h3>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                onClick={() => applyPreset(p.id)}
                aria-pressed={activePreset === p.id}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  activePreset === p.id
                    ? 'border-gold-500/70 bg-gold-500/15 text-gold-300'
                    : 'border-ink-700/70 text-ink-400 hover:border-ink-600 hover:text-ink-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {categories.map((c) => {
            const pct = share(c.code);
            const official = c.weight;
            const heavier = pct > official + 0.5;
            return (
              <div key={c.code} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-ink-300 sm:w-32">
                  <span aria-hidden="true">{c.emoji}</span>
                  <span className="truncate" title={c.tr}>{c.short}</span>
                </span>
                <input
                  type="range"
                  className="year-range h-5 w-full"
                  min={0}
                  max={50}
                  step={0.5}
                  value={weights[c.code] ?? 0}
                  aria-label={`${c.tr} harcama payı`}
                  onChange={(e) => setOne(c.code, Number(e.target.value))}
                  style={
                    {
                      '--track': `linear-gradient(90deg, ${heavier ? 'var(--color-ember-500)' : 'var(--color-gold-500)'} 0%, ${
                        heavier ? 'var(--color-ember-500)' : 'var(--color-gold-500)'
                      } ${Math.min(100, ((weights[c.code] ?? 0) / 50) * 100)}%, rgb(58 54 71 / 0.85) ${Math.min(
                        100,
                        ((weights[c.code] ?? 0) / 50) * 100,
                      )}%, rgb(58 54 71 / 0.85) 100%)`,
                    } as React.CSSProperties
                  }
                />
                <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular">
                  <span className={heavier ? 'text-ember-400' : 'text-ink-200'}>{pct.toFixed(1)}%</span>
                  <span className="ml-1.5 text-ink-600" title={`Resmî sepetteki payı: %${official.toFixed(1)}`}>
                    /{official.toFixed(0)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 border-t border-ink-700/40 pt-3 text-[11px] leading-relaxed text-ink-500">
          Sağdaki ikinci sayı, aynı kalemin resmî sepetteki payıdır. Kırmızı olanlar sizin resmî sepetten
          daha ağır harcadığınız kalemler. Toplamın 100 olması gerekmez — oranlar kendi içinde
          normalize edilir.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px] text-ink-950"
              style={{ background: source.accent }}
            >
              {source.label}
            </span>
            <span className="text-[10px] text-ink-500">
              kaynağı yukarıdaki seçiciden değiştirin
            </span>
            {source.id === 'enag' && !enagAvailable && (
              <span className="text-[10px] text-ember-400">
                bu dönem ENAG kapsamı dışında — TÜİK kullanıldı
              </span>
            )}
          </div>

          <div className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${useEnag ? 'text-ember-400' : 'text-gold-500'}`}>
            Sizin enflasyonunuz
          </div>
          <div className="mt-2 font-display text-5xl leading-none text-ink-100 sm:text-6xl">
            <AnimatedNumber value={result.personalPct} format={(n) => formatPct(n, 0)} className="tabular" />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="text-ink-400">{useEnag ? 'ENAG sepeti:' : 'Resmî sepet:'}</span>
            <span className="font-mono tabular text-ink-200">{formatPct(result.officialPct, 0)}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular ${
                higher ? 'bg-ember-600/15 text-ember-400' : lower ? 'bg-mint-500/15 text-mint-400' : 'bg-ink-700/50 text-ink-300'
              }`}
              title="Yalnızca harcama dağılımınızdan gelen sapma"
            >
              {result.tilt >= 1 ? '+' : ''}
              {formatPct((result.tilt - 1) * 100, 1)} dağılım etkisi
            </span>
          </div>

          {useEnag && officialYearEnd != null && ratio != null && (
            <div className="mt-3 rounded-xl border border-ember-600/25 bg-ember-600/[0.07] p-3">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ink-400">Aynı dönem, TÜİK ölçümüyle</span>
                <span className="font-mono tabular text-ink-200">{formatPct((officialYearEnd - 1) * 100, 0)}</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ink-400">ENAG, TÜİK'in kaç katını ölçtü</span>
                <span className="font-mono tabular text-ember-400">{formatMultiplier(ratio)}</span>
              </div>
            </div>
          )}
          {useEnag && (
            <p className="mt-3 text-xs leading-relaxed text-ink-400">
              <strong className="text-ink-200">Bu bir koşullu senaryodur.</strong> ENAGrup alt harcama
              gruplarını yayımlamadığı için dağılımınızın etkisi yine resmî alt endekslerden
              hesaplanır; yalnızca genel seviye ENAG ölçümüyle değiştirilir. Okunuşu şudur: “genel
              enflasyon ENAG'ın ölçtüğü kadarsa, benim sepetim bu kadar arttı.” {spanFrom}–{spanTo}{' '}
              aralığı aralık-aralık esasına göre hesaplanır.
            </p>
          )}

          {clipped && (
            <p className="mt-2 rounded-lg border border-ink-700/60 bg-ink-950/40 px-3 py-2 font-mono text-[11px] text-ink-400">
              ENAG kapsamı {ENAG_MIN_YEAR}–{ENAG_MAX_YEAR}; karşılaştırma {enagFrom}–{enagTo} için
              yapıldı.
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            {higher
              ? `Sizin harcama dağılımınız, karşılaştırma sepetinden daha hızlı pahalılaştı. ${spanFrom}–${spanTo} arasında yıllık ortalama %${result.personalAnnualPct.toFixed(1)}, karşılaştırma sepetinde %${result.officialAnnualPct.toFixed(1)}.`
              : lower
                ? `Sizin harcama dağılımınız karşılaştırma sepetinden daha yavaş pahalılaştı: yıllık ortalama %${result.personalAnnualPct.toFixed(1)}, karşılaştırma sepetinde %${result.officialAnnualPct.toFixed(1)}.`
                : 'Sizin dağılımınız resmî sepete çok yakın bir sonuç veriyor.'}
          </p>
        </div>

        <div className="panel rounded-3xl p-5 sm:p-6">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
            Enflasyonunuzu ne sürüklüyor
          </h4>
          <div className="mt-3 space-y-2">
            {result.breakdown.slice(0, 5).map((b, i) => (
              <motion.div
                key={b.category.code}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className="flex items-center gap-2.5"
              >
                <span className="w-24 shrink-0 truncate text-xs text-ink-300" title={b.category.tr}>
                  {b.category.emoji} {b.category.short}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800/80">
                  <motion.div
                    className="h-full rounded-full bg-gold-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, b.contribution))}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular text-ink-400">
                  {b.contribution.toFixed(0)}% · {b.multiplier.toFixed(1)}x
                </span>
              </motion.div>
            ))}
          </div>
          <p className="mt-3.5 border-t border-ink-700/40 pt-3 text-[11px] leading-relaxed text-ink-500">
            Soldaki yüzde, toplam artışın ne kadarının o kalemden geldiğini; sağdaki çarpan ise o kalemin
            kendi fiyat artışını gösterir. Ağırlıklar {categoryMeta.weightYear} resmî sepetiyle
            karşılaştırılır.
          </p>
        </div>
      </div>
    </div>
  );
}
