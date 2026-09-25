import { ENAG_MAX_YEAR, ENAG_MIN_YEAR, enagIndex, enagMeta } from './enag';
import { cpi, meta } from './series';
import { MAX_MONTHLY_YEAR, MIN_MONTHLY_YEAR, yearEnd } from './monthly';

export type SourceId = 'tuik' | 'enag';

/**
 * How a source's index is constructed. The two available bases answer slightly
 * different questions and are not interchangeable:
 *
 *   annual-average  compares a year's twelve months against the previous
 *                   year's twelve. Right for "what did money held through the
 *                   year lose", and the basis the app has always used.
 *   year-end        compares December against December. The basis Turkish
 *                   headlines report each January.
 */
export type Basis = 'annual-average' | 'year-end';

export interface SourceDefinition {
  id: SourceId;
  /** Short label for the toggle. */
  label: string;
  /** Label with its character, for headings. */
  fullLabel: string;
  /** Neutral one-liner. States what the body is, not whether it is right. */
  description: string;
  basis: Basis;
  basisLabel: string;
  minYear: number;
  maxYear: number;
  sourceName: string;
  sourceUrl: string;
  /** When the underlying data was last refreshed. */
  lastUpdated: string;
  /** Tailwind-facing CSS custom property for this source's accent. */
  accent: string;
  accentClass: string;
  /** The index on this source's own basis. */
  index: (year: number) => number | null;
  /**
   * The index on a December-to-December basis, so two sources built on
   * different bases can still be compared like for like.
   */
  yearEndIndex: (year: number) => number | null;
}

export const SOURCES: Record<SourceId, SourceDefinition> = {
  tuik: {
    id: 'tuik',
    label: 'TÜİK',
    fullLabel: 'TÜİK (Resmî)',
    description:
      'Türkiye İstatistik Kurumu, Türkiye’nin resmî devlet istatistik kurumudur ve TÜFE’yi aylık olarak yayımlar. Buradaki seri, World Bank ve Eurostat üzerinden derlenmiş resmî TÜFE verisine dayanır.',
    basis: 'annual-average',
    basisLabel: 'yıllık ortalama',
    minYear: meta.minYear,
    maxYear: meta.maxYear,
    sourceName: 'World Bank / Eurostat (kaynağında TÜİK)',
    sourceUrl: 'https://data.worldbank.org/indicator/FP.CPI.TOTL?locations=TR',
    lastUpdated: meta.cpiLastUpdated,
    accent: 'var(--color-gold-400)',
    accentClass: 'gold',
    index: cpi,
    yearEndIndex: (year) => (year >= MIN_MONTHLY_YEAR && year <= MAX_MONTHLY_YEAR ? yearEnd(year) : null),
  },
  enag: {
    id: 'enag',
    label: 'ENAG',
    fullLabel: 'ENAG (Bağımsız)',
    description:
      'Enflasyon Araştırma Grubu, kendi yöntemiyle bağımsız bir tüketici fiyat endeksi (E-TÜFE) hesaplayıp yayımlayan bir akademisyen grubudur. Resmî bir kurum değildir.',
    basis: 'year-end',
    basisLabel: 'aralık-aralık',
    minYear: ENAG_MIN_YEAR,
    maxYear: ENAG_MAX_YEAR,
    sourceName: 'ENAGrup E-TÜFE (Internet Archive üzerinden derlendi)',
    sourceUrl: 'https://enagrup.org/',
    lastUpdated: enagMeta.harvestedAt,
    accent: 'var(--color-ember-400)',
    accentClass: 'ember',
    index: enagIndex,
    yearEndIndex: enagIndex,
  },
};

export const SOURCE_LIST = Object.values(SOURCES);

export const getSource = (id: SourceId): SourceDefinition => SOURCES[id];

/** A span narrowed to what a source actually covers, or null if they miss entirely. */
export function clampToCoverage(
  source: SourceDefinition,
  fromYear: number,
  toYear: number,
): { from: number; to: number; clipped: boolean } | null {
  const from = Math.max(fromYear, source.minYear);
  const to = Math.min(toYear, source.maxYear);
  if (to <= from) return null;
  return { from, to, clipped: from !== fromYear || to !== toYear };
}

export interface SourceMetrics {
  source: SourceDefinition;
  /** The span actually used, after clamping to coverage. */
  from: number;
  to: number;
  clipped: boolean;
  /** Price relative across the span. */
  multiplier: number;
  /** Share of purchasing power surviving, 0–1. */
  surviving: number;
  cumulativePct: number;
  annualPct: number;
}

/**
 * Every derived figure for one source over one span, computed in a single place
 * so a component never re-implements the arithmetic. Returns null when the
 * source cannot cover any part of the span.
 *
 * @param basis pass 'year-end' to force a cross-source-comparable basis
 */
export function metricsFor(
  source: SourceDefinition,
  fromYear: number,
  toYear: number,
  basis?: Basis,
): SourceMetrics | null {
  const span = clampToCoverage(source, fromYear, toYear);
  if (!span) return null;

  const read = basis === 'year-end' ? source.yearEndIndex : source.index;
  const a = read(span.from);
  const b = read(span.to);
  if (a == null || b == null || a === 0) return null;

  const multiplier = b / a;
  const years = Math.max(1, span.to - span.from);

  return {
    source,
    from: span.from,
    to: span.to,
    clipped: span.clipped,
    multiplier,
    surviving: 1 / multiplier,
    cumulativePct: (multiplier - 1) * 100,
    annualPct: (Math.pow(multiplier, 1 / years) - 1) * 100,
  };
}

/** Both sources over the same span, on a shared year-end basis. */
export function compareSources(fromYear: number, toYear: number): SourceMetrics[] {
  return SOURCE_LIST.map((s) => metricsFor(s, fromYear, toYear, 'year-end')).filter(
    (m): m is SourceMetrics => m !== null,
  );
}

/** The span where every source has data — what the compare view can honestly draw. */
export function commonSpan(fromYear: number, toYear: number): { from: number; to: number } | null {
  let from = fromYear;
  let to = toYear;
  for (const s of SOURCE_LIST) {
    from = Math.max(from, s.minYear);
    to = Math.min(to, s.maxYear);
  }
  return to > from ? { from, to } : null;
}

/** Worst single year for prices inside a span, on the given source. */
export function peakYearFor(
  source: SourceDefinition,
  fromYear: number,
  toYear: number,
): { year: number; rate: number } | null {
  const span = clampToCoverage(source, fromYear, toYear);
  if (!span) return null;
  let best: { year: number; rate: number } | null = null;
  for (let year = span.from; year <= span.to; year++) {
    const now = source.index(year);
    const prior = source.index(year - 1);
    if (now == null || prior == null || prior === 0) continue;
    const rate = (now / prior - 1) * 100;
    if (!best || rate > best.rate) best = { year, rate };
  }
  return best;
}

/** First year the starting amount falls below `pct` of its value, on the given source. */
export function halfLifeYearFor(
  source: SourceDefinition,
  fromYear: number,
  toYear: number,
  pct = 50,
): number | null {
  const span = clampToCoverage(source, fromYear, toYear);
  if (!span) return null;
  const base = source.index(span.from);
  if (base == null || base === 0) return null;
  for (let year = span.from; year <= span.to; year++) {
    const value = source.index(year);
    if (value == null) continue;
    if ((base / value) * 100 <= pct) return year;
  }
  return null;
}

/**
 * The years the year pickers may offer.
 *
 * Sources cover different periods, so the selectable range has to track the
 * active one — otherwise a span can be chosen that the source cannot price,
 * which previously surfaced as an unexplained "no change" instead of an error.
 * While comparing, the range narrows again to the years every source shares.
 */
export function selectableBounds(
  source: SourceDefinition,
  comparing: boolean,
  liveMaxYear: number,
): { min: number; max: number } {
  if (comparing) {
    const shared = commonSpan(-Infinity, liveMaxYear);
    if (shared) return { min: shared.from, max: shared.to };
  }
  return { min: source.minYear, max: Math.min(source.maxYear, liveMaxYear) };
}

export interface RangePreset {
  label: string;
  from: number;
}

/**
 * Shortcut spans generated from the active bounds rather than hard-coded, so a
 * narrow source never offers a year it cannot price. Duplicates are dropped:
 * across a five-year source, "son 10 yıl" and the whole series would otherwise
 * be the same button twice.
 */
export function rangePresets(minYear: number, maxYear: number): RangePreset[] {
  const candidates: RangePreset[] = [
    ...[1, 3, 5, 10, 25].map((n) => ({ label: `Son ${n} yıl`, from: maxYear - n })),
    { label: '2005 — bugün', from: 2005 },
    { label: '1980 — bugün', from: 1980 },
    { label: 'Tüm seri', from: minYear },
  ];

  const seen = new Set<number>();
  return candidates.filter((c) => {
    if (c.from < minYear || c.from >= maxYear || seen.has(c.from)) return false;
    seen.add(c.from);
    return true;
  });
}

/** Pulls a span inside `bounds`, keeping at least one year between the ends. */
export function clampSpan(
  from: number,
  to: number,
  bounds: { min: number; max: number },
): { from: number; to: number } {
  const clampedFrom = Math.min(Math.max(from, bounds.min), bounds.max - 1);
  const clampedTo = Math.min(Math.max(to, clampedFrom + 1), bounds.max);
  return { from: clampedFrom, to: clampedTo };
}
