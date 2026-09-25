import assetData from '../data/assets.json';
import { erosionSeries, multiplier } from './inflation';
import { hasMonthly, monthlyErosion } from './monthly';
import { eurRate, usdRate } from './series';
import {
  SOURCE_LIST,
  clampToCoverage,
  commonSpan,
  type SourceDefinition,
} from './sources';

/**
 * A single point on the erosion chart.
 *
 * `x` is a decimal year (2015.5 is mid-2015) so that annual points, monthly
 * points and event pins all live on one continuous numeric axis. Recharts can
 * then place an event in March without the axis having to be categorical.
 */
export interface ChartPoint {
  x: number;
  label: string;
  nominal: number;
  real: number;
  realPct: number;
  inflation: number | null;
  usd: number | null;
  eur: number | null;
}

export const decimalYear = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y + (m - 1) / 12;
};

const monthlyAssets = assetData.monthly as Record<string, Record<string, number>>;

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const formatMonthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${TR_MONTHS[m - 1]} ${y}`;
};

export interface ChartSeries {
  points: ChartPoint[];
  /** True when the curve is drawn at month resolution. */
  isMonthly: boolean;
  /** The span actually drawn, after clamping to the source's coverage. */
  from: number;
  to: number;
  clipped: boolean;
}

/**
 * Builds the chart series at the best resolution the data supports.
 *
 * Monthly whenever the span falls inside the monthly index's coverage,
 * benchmarked to the annual engine so both views agree at the endpoints;
 * annual otherwise, which is what spans reaching back before 1996 get.
 */
export function buildChartSeries(
  amount: number,
  fromYear: number,
  toYear: number,
  source?: SourceDefinition,
): ChartSeries {
  // A source other than the official one carries its own coverage and its own
  // index, so it gets a plain annual curve built from that index instead of the
  // monthly official series.
  if (source && source.id !== 'tuik') {
    const span = clampToCoverage(source, fromYear, toYear);
    if (!span) return { points: [], isMonthly: false, from: fromYear, to: toYear, clipped: true };

    const base = source.index(span.from);
    const points: ChartPoint[] = [];
    for (let year = span.from; year <= span.to; year++) {
      const value = source.index(year);
      if (value == null || base == null || base === 0) continue;
      const m = value / base;
      const prior = source.index(year - 1);
      const usd = usdRate(year);
      const eur = eurRate(year);
      points.push({
        x: year,
        label: String(year),
        nominal: amount * m,
        real: amount / m,
        realPct: (1 / m) * 100,
        inflation: prior ? (value / prior - 1) * 100 : null,
        usd: usd ? amount / usd : null,
        eur: eur ? amount / eur : null,
      });
    }
    return { points, isMonthly: false, from: span.from, to: span.to, clipped: span.clipped };
  }

  if (hasMonthly(fromYear, toYear)) {
    const target = multiplier(fromYear, toYear);
    const points = monthlyErosion(amount, fromYear, toYear, target).map((p): ChartPoint => ({
      x: decimalYear(p.t),
      label: formatMonthLabel(p.t),
      nominal: p.nominal,
      real: p.real,
      realPct: p.realPct,
      inflation: p.yoy,
      usd: monthlyAssets.usdTry?.[p.t] ? amount / monthlyAssets.usdTry[p.t] : null,
      eur: monthlyAssets.eurTry?.[p.t] ? amount / monthlyAssets.eurTry[p.t] : null,
    }));
    if (points.length > 1) {
      return { points, isMonthly: true, from: fromYear, to: toYear, clipped: false };
    }
  }

  const points = erosionSeries(amount, fromYear, toYear).map((p): ChartPoint => {
    const usd = usdRate(p.year);
    const eur = eurRate(p.year);
    return {
      x: p.year,
      label: String(p.year),
      nominal: p.nominal,
      real: p.real,
      realPct: p.realPct,
      inflation: p.inflation,
      usd: usd ? amount / usd : null,
      eur: eur ? amount / eur : null,
    };
  });

  return { points, isMonthly: false, from: fromYear, to: toYear, clipped: false };
}

// ---------------------------------------------------------------------------
// Cross-source comparison
// ---------------------------------------------------------------------------

export interface ComparePoint {
  x: number;
  label: string;
  /** Real value remaining under each source, keyed by source id. */
  [seriesKey: string]: number | string | null;
}

export interface ComparisonSeries {
  points: ComparePoint[];
  from: number;
  to: number;
  /** Source ids actually drawn, in registry order. */
  keys: { id: string; label: string; accent: string }[];
  clipped: boolean;
}

/**
 * Both sources over the years they share, on a December-to-December basis.
 *
 * The bases have to be forced to match here. The official series is normally
 * read as an annual average and ENAGrup's only exists December-to-December, so
 * leaving each on its own basis would put part of the visible gap down to
 * method rather than measurement — which is precisely the thing this view is
 * supposed to isolate.
 */
export function buildComparison(amount: number, fromYear: number, toYear: number): ComparisonSeries {
  const span = commonSpan(fromYear, toYear);
  if (!span) {
    return { points: [], from: fromYear, to: toYear, keys: [], clipped: true };
  }

  const usable = SOURCE_LIST.filter((s) => s.yearEndIndex(span.from) != null);
  const points: ComparePoint[] = [];

  for (let year = span.from; year <= span.to; year++) {
    const point: ComparePoint = { x: year, label: String(year) };
    for (const source of usable) {
      const base = source.yearEndIndex(span.from);
      const value = source.yearEndIndex(year);
      point[source.id] = base && value ? amount / (value / base) : null;
      point[`${source.id}_nominal`] = base && value ? amount * (value / base) : null;
    }
    points.push(point);
  }

  return {
    points,
    from: span.from,
    to: span.to,
    keys: usable.map((s) => ({ id: s.id, label: s.label, accent: s.accent })),
    clipped: span.from !== fromYear || span.to !== toYear,
  };
}
