import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import { AssetRace } from './components/AssetRace';
import { ComparisonChart } from './components/ComparisonChart';
import { SourceToggle } from './components/SourceToggle';
import { Basket } from './components/Basket';
import { Controls } from './components/Controls';
import { ErosionChart } from './components/ErosionChart';
import { HardCurrency } from './components/HardCurrency';
import { Headline } from './components/Headline';
import { Methodology } from './components/Methodology';
import { PersonalBasket } from './components/PersonalBasket';
import { Section } from './components/Section';
import { Stat } from './components/Stat';

import { SourceProvider } from './context/SourceProvider';
import { useSource, type ViewMode } from './context/source';
import { useLiveData } from './hooks/useLiveData';
import { useUrlState } from './hooks/useUrlState';

import { compareBasket } from './lib/basket';
import { assetsMaxYear, assetsMinYear } from './lib/assets';
import { buildChartSeries, buildComparison } from './lib/chart';
import { eventsForChart } from './lib/events';
import { CATEGORY_MAX_YEAR, CATEGORY_MIN_YEAR } from './lib/monthly';
import { formatMultiplier, formatPct, formatTRY, parseAmount } from './lib/format';
import {
  SOURCE_LIST,
  clampSpan,
  halfLifeYearFor,
  metricsFor,
  peakYearFor,
  selectableBounds,
} from './lib/sources';
import { MAX_YEAR, REDENOM_FACTOR, REDENOM_YEAR, meta } from './lib/series';

export default function App() {
  const [params, patch] = useUrlState({
    amount: '1.000',
    from: 2010,
    to: MAX_YEAR,
    old: false as boolean,
    view: 'tuik' as string,
  });

  const setView = useCallback((view: ViewMode) => patch({ view }), [patch]);
  const view = (['tuik', 'enag', 'compare'].includes(params.view) ? params.view : 'tuik') as ViewMode;

  return (
    <SourceProvider view={view} onViewChange={setView}>
      <Versus params={params} patch={patch} />
    </SourceProvider>
  );
}

interface BodyProps {
  params: { amount: string; from: number; to: number; old: boolean; view: string };
  patch: (updates: Partial<BodyProps['params']>) => void;
}

function Versus({ params, patch }: BodyProps) {
  const live = useLiveData();
  const { source, isComparing } = useSource();
  const maxYear = live.maxYear;

  const [copied, setCopied] = useState(false);

  /**
   * The years the sliders may reach.
   *
   * Sources do not all span the same period — the official series starts in
   * 1960, ENAGrup's in 2020 — so the range has to follow whatever is selected.
   * Letting the sliders roam outside it produced a span the source could not
   * price, which surfaced as a silent "no change" rather than as an error.
   * Comparing narrows further, to the years every source shares.
   */
  const bounds = useMemo(
    () => selectableBounds(source, isComparing, maxYear),
    [isComparing, source, maxYear],
  );

  // Clamped for rendering, so there is never a frame with an unpriceable span.
  const { from: fromYear, to: toYear } = clampSpan(params.from, params.to, bounds);

  // Switching source can leave the stored years outside the new range; pull
  // them back in so the URL matches what is actually being shown.
  useEffect(() => {
    if (fromYear !== params.from || toYear !== params.to) {
      patch({ from: fromYear, to: toYear });
    }
  }, [fromYear, toYear, params.from, params.to, patch]);
  const entered = parseAmount(params.amount);
  const useOldLira = params.old && fromYear < REDENOM_YEAR;
  const amount = useOldLira ? entered / REDENOM_FACTOR : entered;

  const model = useMemo(() => {
    const safe = amount > 0 ? amount : 0;
    // Every headline figure comes from one call, so no component can end up
    // describing a different source than the one the user selected.
    const metrics = metricsFor(source, fromYear, toYear);
    // No silent identity fallback: a source that cannot price the span must
    // say so rather than quietly reporting that nothing changed.
    const mult = metrics?.multiplier ?? null;
    return {
      metrics,
      available: metrics !== null,
      adjusted: mult == null ? 0 : safe * mult,
      mult: mult ?? 1,
      surviving: metrics?.surviving ?? 1,
      cumulative: metrics?.cumulativePct ?? 0,
      annual: metrics?.annualPct ?? 0,
      peak: peakYearFor(source, fromYear, toYear),
      half: halfLifeYearFor(source, fromYear, toYear),
      chart: buildChartSeries(safe, fromYear, toYear, source),
      comparison: buildComparison(safe, fromYear, toYear),
      events: eventsForChart(fromYear, toYear),
      basket: mult == null ? [] : compareBasket(safe, fromYear, toYear, mult),
    };
    // live.version is load-bearing even though the linter cannot see it: when
    // the Function extends the series, useLiveData mutates the module-level
    // data in place and bumps this counter. Without it the memo would keep
    // serving figures computed from the pre-extension series.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromYear, toYear, source, live.version]);

  const span = toYear - fromYear;
  // Income lines are excluded: a wage outrunning CPI is not a loss.
  const worstBasket = model.basket.find((r) => !r.isIncome);

  /**
   * The personal basket and the asset race rest on shorter series than the
   * 1960-onward CPI, so each clamps to what its own data covers rather than
   * disappearing whenever the user drags outside it.
   */
  const clampRange = (lo: number, hi: number): [number, number] | null => {
    const a = Math.max(fromYear, lo);
    const b = Math.min(toYear, hi);
    return b > a ? [a, b] : null;
  };
  const personalRange = clampRange(CATEGORY_MIN_YEAR, CATEGORY_MAX_YEAR);
  const assetRange = clampRange(assetsMinYear(), assetsMaxYear());

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl leading-none tracking-tight text-ink-100 sm:text-6xl"
          >
            Versus
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-3 max-w-xl text-balance text-sm leading-relaxed text-ink-400 sm:text-base"
          >
            Türk Lirası'nın alım gücü, yıl yıl. Bir tutar girin; bugünkü karşılığını, o gün neler
            alabildiğinizi ve değerin nasıl eridiğini görün.
          </motion.p>
        </div>

        <div className="flex items-center gap-2">
          <span
            title={
              isComparing
                ? 'İki kaynak birlikte gösteriliyor.'
                : `${source.fullLabel} · ${source.basisLabel} esası · güncellenme ${source.lastUpdated}`
            }
            className="flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-[11px] text-ink-400"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isComparing ? 'var(--color-ink-300)' : source.accent }}
            />
            {isComparing
              ? `${SOURCE_LIST.length} kaynak karşılaştırılıyor`
              : `${source.label} · ${source.minYear}–${source.maxYear}`}
          </span>
          <button
            type="button"
            onClick={share}
            className="rounded-full border border-ink-700/70 bg-ink-900/60 px-3 py-1.5 text-[11px] text-ink-400 transition-colors hover:border-gold-500/50 hover:text-gold-300"
          >
            {copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
          </button>
        </div>
      </header>

      <div className="mt-10 space-y-4">
        <SourceToggle />

        <Controls
          minYear={bounds.min}
          maxYear={bounds.max}
          rawAmount={params.amount}
          amount={entered}
          fromYear={fromYear}
          toYear={toYear}
          oldLira={params.old}
          onAmount={(amount) => patch({ amount })}
          onFromYear={(from) => patch({ from })}
          onToYear={(to) => patch({ to })}
          onOldLira={(old) => patch({ old })}
        />

        {amount > 0 && span > 0 && model.metrics?.clipped && (
          <div className="rounded-2xl border border-gold-500/25 bg-gold-500/[0.07] px-4 py-3 text-xs leading-relaxed text-ink-300">
            {source.fullLabel} verisi {source.minYear}–{source.maxYear} aralığını kapsıyor. Seçtiğiniz{' '}
            {fromYear}–{toYear} dönemi yerine{' '}
            <strong className="text-gold-300">
              {model.metrics.from}–{model.metrics.to}
            </strong>{' '}
            için hesaplandı.
          </div>
        )}

        {amount > 0 && span > 0 && !model.available ? (
          <div className="panel rounded-3xl px-6 py-12 text-center">
            <p className="text-sm text-ink-300">
              {source.fullLabel} verisi {fromYear}–{toYear} dönemini kapsamıyor.
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Bu kaynak {source.minYear}–{source.maxYear} aralığını kapsar.
            </p>
          </div>
        ) : amount > 0 && span > 0 ? (
          <>
            <Headline
              amount={amount}
              adjusted={model.adjusted}
              fromYear={fromYear}
              toYear={toYear}
              multiplierValue={model.mult}
              surviving={model.surviving}
              oldLiraOriginal={useOldLira ? entered : undefined}
              sourceLabel={source.label}
              sourceAccent={source.accent}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label="Toplam enflasyon"
                  value={formatPct(model.cumulative, 0)}
                  hint={`${span} yılda fiyatlar ${formatMultiplier(model.mult)} arttı`}
                  tone="ember"
                  delay={0.05}
                />
                <Stat
                  label="Yıllık ortalama"
                  value={formatPct(model.annual)}
                  hint="Bileşik yıllık TÜFE artışı"
                  tone="gold"
                  delay={0.1}
                />
                <Stat
                  label="Kalan alım gücü"
                  value={formatPct(model.surviving * 100, 2)}
                  hint={
                    model.half
                      ? `Yarısı ${model.half} yılında tükendi`
                      : 'Bu aralıkta yarıya inmedi'
                  }
                  tone="ember"
                  delay={0.15}
                />
                <Stat
                  label="En sert yıl"
                  value={model.peak ? `${model.peak.year}` : '—'}
                  hint={model.peak ? `TÜFE ${formatPct(model.peak.rate)}` : undefined}
                  tone="neutral"
                  delay={0.2}
                />
              </div>
              <HardCurrency
                amount={amount}
                adjusted={model.adjusted}
                fromYear={fromYear}
                toYear={toYear}
                today={live.today}
              />
            </div>
          </>
        ) : (
          <div className="panel rounded-3xl px-6 py-14 text-center">
            <p className="text-sm text-ink-400">
              {span <= 0
                ? 'Başlangıç ve bitiş yılı farklı olmalı.'
                : 'Karşılaştırmayı görmek için bir tutar girin.'}
            </p>
          </div>
        )}
      </div>

      {amount > 0 && span > 0 && (
        <>
          <Section
            eyebrow={isComparing ? 'Karşılaştırma' : 'Erime eğrisi'}
            title={isComparing ? 'İki ölçüm, aynı para' : 'Değer nasıl gitti'}
            description={
              isComparing ? (
                <>
                  Aynı {formatTRY(amount)} ₺, iki ayrı enflasyon ölçümüne göre. Aradaki açıklık,
                  hangi seriyi doğru kabul ettiğinizin ne kadar fark ettiğini doğrudan gösterir.
                </>
              ) : (
                <>
                  {formatTRY(amount)} ₺'nin {model.chart.from}–{model.chart.to} arasındaki seyri,{' '}
                  {source.label} verisine göre. Grafiğe dokunarak ya da imleci gezdirerek her dönemi
                  okuyabilirsiniz.
                </>
              )
            }
          >
            {isComparing ? (
              <ComparisonChart
                comparison={model.comparison}
                events={model.events}
                amount={amount}
              />
            ) : (
              <ErosionChart
                series={model.chart}
                events={model.events}
                amount={amount}
                fromYear={model.chart.from}
                toYear={model.chart.to}
              />
            )}
          </Section>

          {personalRange && (
            <Section
              eyebrow="Kişisel sepet"
              title="Senin enflasyonun"
              description={
                <>
                  Resmî enflasyon tek bir ortalama sepete dayanır. Kendi harcama dağılımınızı girin,
                  aynı yöntemle sizin için hesaplansın. Fark yalnızca ağırlıklardan gelir — hesaplama
                  yöntemi her iki tarafta da aynıdır.
                </>
              }
            >
              <PersonalBasket fromYear={personalRange[0]} toYear={personalRange[1]} />
            </Section>
          )}

          {assetRange && (
            <Section
              eyebrow="Ne yapsaydınız"
              title="Altın mı, dolar mı, borsa mı"
              description={
                <>
                  {formatTRY(amount)} ₺'yi {assetRange[0]} yılında farklı yerlere koysaydınız,{' '}
                  {assetRange[1]} yılında enflasyondan arındırılmış olarak eliniz ne kadar olurdu?
                  Çarpanın 1,00'in üzerinde olması, o seçimin enflasyonu yendiği anlamına gelir.
                </>
              }
            >
              <AssetRace
                amount={amount}
                fromYear={assetRange[0]}
                toYear={assetRange[1]}
                cpiOverride={metricsFor(source, assetRange[0], assetRange[1])?.multiplier}
              />
            </Section>
          )}

          <Section
            eyebrow="Ürün sepeti"
            title="O gün ne alırdı, bugün ne alıyor"
            description={
              <>
                Sol çubuk {fromYear} yılında {formatTRY(amount)} ₺ ile alabildiğiniz miktar. Sağ çubuk,
                enflasyona göre düzeltilmiş {formatTRY(model.adjusted)} ₺ ile {toYear} yılında
                alabildiğiniz miktar.{' '}
                <span className="text-ink-300">
                  Kırmızı çubuk, o kalemin resmî enflasyonu geçtiğini gösterir.
                </span>
              </>
            }
          >
            {worstBasket && worstBasket.ratio < 0.995 && (
              <div className="mb-4 rounded-2xl border border-ember-600/25 bg-ember-600/[0.07] px-5 py-4">
                <p className="text-sm leading-relaxed text-ink-200">
                  En çok geriye düşen kalem{' '}
                  <strong className="text-ember-400">{worstBasket.item.name.toLocaleLowerCase('tr')}</strong>:
                  enflasyona göre düzeltilmiş paranızla{' '}
                  <strong className="text-ember-400">{formatPct((1 - worstBasket.ratio) * 100, 0)}</strong>{' '}
                  daha az alabiliyorsunuz. Yılda ortalama {formatPct(worstBasket.itemAnnualPct)} zamlanmış,
                  TÜFE ise {formatPct(model.annual)}.
                </p>
              </div>
            )}
            <Basket rows={model.basket} fromYear={fromYear} toYear={toYear} />
          </Section>

          <Section
            eyebrow="Yöntem"
            title="Rakamlar nereden geliyor"
            description="Her şey tarayıcıda hesaplanır. Sunucu yok, hesap yok, takip yok."
          >
            <Methodology live={live} />
          </Section>
        </>
      )}

      <footer className="mt-20 border-t border-ink-800 pt-6 text-xs leading-relaxed text-ink-600">
        <p>
          Versus bir bilgilendirme aracıdır; yatırım tavsiyesi değildir. TÜFE bir ortalamadır ve hiçbir
          hanenin harcama sepetiyle birebir örtüşmez.
        </p>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {SOURCE_LIST.map((s) => (
            <div key={s.id} className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px]">
              <span className="flex items-center gap-1.5 text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
                {s.fullLabel}
              </span>
              <span>
                {s.minYear}–{s.maxYear} · {s.basisLabel} · güncellenme {s.lastUpdated}
              </span>
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-ink-700 underline-offset-2 transition-colors hover:text-ink-400"
              >
                {s.sourceName}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[11px]">
          paket {meta.generatedAt}
          {live.notes.length > 0 && ` · ${live.notes.join(' ')}`}
        </p>
      </footer>
    </div>
  );
}
